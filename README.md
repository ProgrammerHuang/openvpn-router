# openvpn-router

[![David](https://img.shields.io/david/ekristen/openvpn-router.svg)](https://github.com/ekristen/openvpn-router) [![David](https://img.shields.io/david/dev/ekristen/openvpn-router.svg)](https://github.com/ekristen/openvpn-router) [![ImageLayers Layers](https://img.shields.io/imagelayers/layers/ekristen/openvpn-router/latest.svg)](https://hub.docker.com/r/ekristen/openvpn-router/) [![ImageLayers Size](https://img.shields.io/imagelayers/image-size/ekristen/openvpn-router/latest.svg)](https://hub.docker.com/r/ekristen/openvpn-router/) 

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
  --name="openvpn-router" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ekristen/openvpn-router \
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

  openvpn-router:
    container_name: openvpn-router
    image: ekristen/openvpn-router
    command: --network custom_default --nat-source 172.249.1.0/24 --route 10.10.100.0/24
    restart: always
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
