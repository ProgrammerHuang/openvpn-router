# openvpn-monitor

Using an openvpn client in a docker container is awesome, but is pointless if you cannot manage to route your traffic through it. There are various ways to route traffic, but most require using the host network, creating routes on the host, or making other odd changes. This tool allows everything to remain in containers.

This is a helper tool for [openvpn-client](https://github.com/ekristen/docker-openvpn-client) docker image. Its purpose is to help manage iptable rules and routes in various containers based on configuration.

## Requirements

 * `ekristen/openvpn-client`
 * `--cap-add=NET_ADMIN` on whatever container you want to add routes to

## Options

* `--name` - the name of the openvpn-client container
* `--network` - the docker network in the openvpn-client container to use for routes
* `--nat-source` - to get traffic to route properly, you'll have to nat the docker network traffic through the OpenVPN client ip (can be specified multiple times)
* `--route` - routes to send to the openvpn-client for specified containers (can be specified multiple times)
* `--route-container` - containers to apply the routes to (can be specified multiple times)

## Running

```bash
docker run -it \
  --name="openvpn-monitor" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ekristen/openvpn-monitor \
  --nat-source 172.149.0.0/16
```

## Example Docker Compose

```yml
version: '2'

services:
  openvpn-client:
    container_name: openvpn-client
    image: ekristen/openvpn-client
    command: --config /vpn/client.ovpn --askpass /vpn/client.pwd --auth-nocache
    cap_add:
      - NET_ADMIN
    devices:
      - "/dev/net/tun:/dev/net/tun"
    volumes:
      - /data/vpn:/vpn

  openvpn-monitor:
    container_name: openvpn-monitor
    image: ekristen/openvpn-monitor
    command: --network custom_default --nat-source 172.249.1.0/24 --route 10.10.100.0/24
    restart: always
    network_mode: host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - openvpn-client
  
networks:
  default:
    ipam:
      driver: default
      config:
        - subnet: 172.249.0.0/16
          ip_range: 172.249.1.0/24
          gateway: 172.249.1.254
```
