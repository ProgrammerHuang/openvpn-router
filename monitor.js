var util = require('util')
var events = require('events')

var after = require('after')
var bunyan = require('bunyan')
var minimist = require('minimist')
var Docker = require('dockerode')
var DockerEvents = require('docker-events')

var argv = minimist(process.argv.slice(2), {
  default: {
    'docker': '/var/run/docker.sock',
    'name': process.env.NAME || 'openvpn-client',
    'network': process.env.NETWORK || 'bridge',
    'nat-source': process.env.NAT_SOURCE ? process.env.NAT_SOURCE.split(',') : [],
    'route': process.env.ROUTE ? process.env.ROUTE.split(',') : [],
    'route-container': process.env.ROUTE_CONTAINER ? process.env.ROUTE_CONTAINER.split(',') : []
  }
});

var clientName = argv['name']
var clientNetwork = argv['network']
var natSources = argv['nat-source']
var routes = argv['route'] || []
var routeContainers = argv['route-container'] || []

if (natSources.constructor.name != 'Array') {
  natSources = [ natSources ]
}
if (routes.constructor.name != 'Array') {
  routes = [ routes ]
}
if (routeContainers.constructor.name != 'Array') {
  routeContainers = [ routeContainers ]
}


var logger = bunyan.createLogger({name: 'openvpn-monitor', level: 'debug'})
var docker = new Docker()
var dockerevents = new DockerEvents({
  docker: docker
}).start()

var monitor = new events.EventEmitter
var vpnContainer

function processContainer(container) {
  if (container.Name.substr(1, container.Name.length) == clientName) {
    // this is the openvpn-client, exec iptables

    vpnContainer = docker.getContainer(container.Id)

    natSources.forEach(function(source) {
      var execOptions = {
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Cmd: [
          "/bin/ash",
          "-c",
          util.format("iptables -t nat -nvL | grep \"SNAT\" | grep \"%s\" | grep \"$(ifconfig eth0 | awk '/t addr:/{gsub(/.*:/,\"\",$2);print $2}')\" || iptables -t nat -A POSTROUTING -s %s -j SNAT --to-source $(ifconfig tun0 | awk '/t addr:/{gsub(/.*:/,\"\",$2);print $2}')", source, source),
        ]
      }
      
      logger.debug({container: container.Id, source: source, opts: execOptions}, 'docker.exec')
      
      vpnContainer.exec(execOptions, function(err, exec) {
        if (err) {
          return logger.error({err: err}, 'vpn.container.exec.create error')
        }
        exec.start({hijack: true, stdin: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) {
            return logger.error({err: err}, 'vpn.container.exec.start error')
          }
        })
      })
    })
  }
  
  // Check if Route Container Matches 
  if (routeContainers.indexOf(container.Name.substr(1, container.Name.length)) !== -1) {
    vpnContainer.inspect(function(err, container) {
      if (err) {
        return logger.error({err: err}, 'route.container.vpn.inspect error')
      }

      var IPAddress = container.NetworkSettings.Networks[clientNetwork].IPAddress

      routes.forEach(function(route) {
        var execOptions = {
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: [
            "/bin/sh",
            "-c",
            util.format("ip route | grep \"via\" | grep \"%s\" | grep \"%s\" || ip route add %s via %s", route, IPAddress, route, IPAddress),
          ]
        }

        logger.debug({container: container.Id, source: route, opts: execOptions}, 'docker.exec')
      
        vpnContainer.exec(execOptions, function(err, exec) {
          if (err) {
            return logger.error({err: err}, 'route.container.exec.create error')
          }

          exec.start({hijack: true, stdin: true, stdout: true, stderr: true}, function(err, stream) {
            if (err) {
              return logger.error({err: err}, 'route.container.exec.start error')
            }
          })
        })
      })
    })
  }
}

monitor.on('exists', processContainer)
monitor.on('start', processContainer)


function vpnContainer(callback) {
  var found = false

  docker.listContainers(function(err, containers) {
    var done = after(containers.length, function(err) {
      if (err) {
        logger.error({err: err}, 'vpnContainer list error')
        return callback(err)
      }

      if (!found) {
        return callback(new Error('unable to find vpn container'))
      }

      vpnContainer.inspect(function(err, container) {
        if (typeof container.NetworkSettings.Networks[clientNetwork] == 'undefined') {
          return callback(new Error('unable to find network for vpn container'))
        }
        
        callback()
      })
    })

    containers.forEach(function(containerInfo) {
      docker.getContainer(containerInfo.Id).inspect(function(err, container) {
        if (container.Name.substr(1, container.Name.length) == clientName) {
          // this is the openvpn-client, exec iptables
          vpnContainer = docker.getContainer(container.Id)
          found = true
        }

        done(err)
      })
    })
  })
}

logger.info('started')

vpnContainer(function() {
  docker.listContainers(function(err, containers) {
    containers.forEach(function(containerInfo) {
      docker.getContainer(containerInfo.Id).inspect(function(err, container) {
        monitor.emit('exists', container)
      })
    })
  })

  dockerevents.on('start', function(event) {
    docker.getContainer(event.id).inspect(function(err, container) {
      monitor.emit('start', container)
    })
  })
})

