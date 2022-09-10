# Kong en Kubernetes con kind

## Introducción

En este guía mostramos como instalar un cluster de `Kubernetes` en la laptop ó máquina de escritorio y usarlo para
desarrollo y pruebas en local, usaremos la implementación de `kind`, la cual corre cada nodo del cluster en un
contenedor en lugar de usar máquinas virtuales, originalmente fue diseñado para probar kubernetes en sí,
pero también puede ser usado para desarrollo local ó CI.

La documentación y el código en este repositorio puede servir para comprender los conceptos, la arquitectura y
adentrarnos más en lo que son los contenedores, los pods y su relación con los micro servicios y aplicaciones
nativas de nube.

Sobre el cluster instalaremos `Kong` como `Ingress Controller` y una aplicación web simple para validar la
funcionalidad de Kong como `API Gateway`.

## Requisitos

Es necesario tener instalado y en ejecución un motor de gestión de contenedores cómo docker, en nuestro caso y para
uso en local, será colima. Este ejercicio lo realizaremos en un equipo MacOS, pero si tienes Linux, puedes instalar
docker usando tu manejador de paquetes favorito.

**NOTA:** Si ya usas la implementación de Docker Desktop puedes saltar los pasos de colima, en caso de usar
un equipo de trabajo considera que este software requiere licencia de uso.

Iniciamos instalando colima y el cliente docker:

```shell
$ brew install colima docker
```

Ahora debemos iniciar colima:

```shell
$ colima start
INFO[0000] starting colima
INFO[0000] runtime: docker
INFO[0000] preparing network ...                         context=vm
INFO[0000] creating and starting ...                     context=vm
INFO[0023] provisioning ...                              context=docker
INFO[0023] starting ...                                  context=docker
INFO[0028] done
```

**NOTA:** Por default colima levanta una máquina virtual con `2` vCPUs y `2` GB de RAM, si se desea modificar
esto para asignar más CPU o RAM, puedes agregar los parámetros `--cpu 4` y `--memory 4`.

Ahora instalamos los paquetes para kubernetes con `kind`, también instalamos el cliente `kubectl` y
`k6` la herramienta de pruebas de carga de aplicaciones web:

```shell
$ brew install kind kubectl helm k6
```

Validamos la instalación de las herramientas, iniciamos con kind:

```shell
$ kind --version
kind version 0.14.0
```

Ahora veamos la versión de `kubectl`:

```shell
$ kubectl version --client=true
Client Version: version.Info{Major:"1", Minor:"24", GitVersion:"v1.24.3"}
Kustomize Version: v4.5.4
```

Validamos que tengamos helm instalado:

```shell
$ helm version
version.BuildInfo{Version:"v3.9.2", GitCommit:"1adde...", GitTreeState:"clean", GoVersion:"go1.18.4"
```

Y finalmente la versión de `k6`:

```shell
$ k6 version
k6 v0.39.0 ((devel)) 
```

Clona este repositorio:

```shell
$ git clone https://github.com/jorgearma1982/kong-k8s-kind.git
```

Cambia tu directorio de trabajo a `kong-k8s-kind`:

```shell
$ cd kong-k8s-kind
```

Listo, ya tienes todo para empezar a crear el cluster.

## Instalación de cluster

Definimos la configuración del cluster con dos nodos, uno con rol de `control-plane` y otro de `worker`.

La configuración está almacenada en el archivo `kind/cluster-multi-ingress.yml`

```shell
$ cat kind/cluster-multi-ingress.yml
---
apiVersion: kind.x-k8s.io/v1alpha4
kind: Cluster
nodes:
  - role: control-plane
  - role: worker
    extraPortMappings:
    - containerPort: 31682
      hostPort: 80
      listenAddress: "127.0.0.1"
      protocol: TCP
    - containerPort: 32581
      hostPort: 8001
      listenAddress: "127.0.0.1"
      protocol: TCP
```

En la configuración de arriba podemos ver para el role `worker` se define el `extraPortMapping`, lo cual significa
que kind realizará una re dirección de puertos adicional, esta configuración básicamente hace un port forward del
puerto en el host hacia el puerto en un servicio dentro del cluster, los puertos que se redireccionan son:

* TCP `31682` al `80` para acceder a los servicios que expone Kong en modo HTTP
* TCP `32581` al `8001` para acceder a la API de administración de Kong en modo HTTP.

Note también que los puertos que se re direccionan se asocian a la dirección local `127.0.0.1`.

Ahora creamos el cluster versión `1.23.4` con la configuración en el archivo `kind/cluster-multi-ingress.yml`:

```shell
$ kind create cluster --name kongcluster --image kindest/node:v1.23.4 --config=kind/cluster-multi-ingress.yml
Creating cluster "kongcluster" ...
 ✓ Ensuring node image (kindest/node:v1.23.4) 🖼
 ✓ Preparing nodes 📦 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
 ✓ Joining worker nodes 🚜
Set kubectl context to "kind-kongcluster"
You can now use your cluster with:

kubectl cluster-info --context kind-kongcluster

Thanks for using kind! 😊
```

Listo!! Ya tenemos un cluster con un nodo de control plane y un worker, hagamos un listado de los clusters de kind:

```shell
$ kind get clusters
kongcluster
```

La salida del comando de arriba muestra un cluster llamado `kongcluster`.

Veamos que pasó a nivel contenedores docker:

```shell
$ docker ps
CONTAINER ID   IMAGE                  COMMAND                  CREATED          STATUS          PORTS                                                NAMES
0313a5f98036   kindest/node:v1.23.4   "/usr/local/bin/entr…"   45 minutes ago   Up 45 minutes   127.0.0.1:61556->6443/tcp                            kongcluster-control-plane
4303a7cb9ed3   kindest/node:v1.23.4   "/usr/local/bin/entr…"   45 minutes ago   Up 45 minutes   127.0.0.1:80->31682/tcp, 127.0.0.1:8001->32581/tcp   kongcluster-worker
```

Arriba se puede ver hay dos contenedores en ejecución asociados a los nodos del cluster.

## Validación del cluster

Además de que el proceso de instalación fue super rápido, kind ya agregó un contexto a la configuración de
`kubectl` local:

```shell
$ kubectl config get-contexts
CURRENT   NAME                       CLUSTER            AUTHINFO       NAMESPACE
*         kind-kongcluster           kind-kongcluster   kind-kongcluster
```

Ahora mostramos la información de dicho cluster:

```shell
$ kubectl cluster-info
Kubernetes control plane is running at https://127.0.0.1:53551
CoreDNS is running at https://127.0.0.1:53551/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

Como se pude ver, el cluster está corriendo en `localhost`.

Mostremos la salud del cluster:

```shell
$ kubectl get --raw '/healthz?verbose'
[+]ping ok
[+]log ok
[+]etcd ok
[+]poststarthook/start-kube-apiserver-admission-initializer ok
[+]poststarthook/generic-apiserver-start-informers ok
[+]poststarthook/priority-and-fairness-config-consumer ok
[+]poststarthook/priority-and-fairness-filter ok
[+]poststarthook/start-apiextensions-informers ok
[+]poststarthook/start-apiextensions-controllers ok
[+]poststarthook/crd-informer-synced ok
[+]poststarthook/bootstrap-controller ok
[+]poststarthook/rbac/bootstrap-roles ok
[+]poststarthook/scheduling/bootstrap-system-priority-classes ok
[+]poststarthook/priority-and-fairness-config-producer ok
[+]poststarthook/start-cluster-authentication-info-controller ok
[+]poststarthook/aggregator-reload-proxy-client-cert ok
[+]poststarthook/start-kube-aggregator-informers ok
[+]poststarthook/apiservice-registration-controller ok
[+]poststarthook/apiservice-status-available-controller ok
[+]poststarthook/kube-apiserver-autoregistration ok
[+]autoregister-completion ok
[+]poststarthook/apiservice-openapi-controller ok
healthz check passed
```

Listamos los nodos del cluster:

```shell
$ kubectl get nodes
NAME                 STATUS   ROLES                  AGE     VERSION
kongcluster-control-plane   Ready    control-plane,master   46m   v1.23.4
kongcluster-worker          Ready    <none>                 46m   v1.23.4
```

Como se puede ver tenemos un nodo que es el maestro, es decir, la capa de control, y tenemos otro que es el worker.

Listemos los pods de los servicios que están en ejecución:

```shell
$ kubectl get pods -A
NAMESPACE            NAME                                         READY   STATUS             RESTARTS   AGE
kube-system          coredns-64897985d-gkm8l                             1/1     Running   0          46m
kube-system          coredns-64897985d-qbb9h                             1/1     Running   0          46m
kube-system          etcd-kongcluster-control-plane                      1/1     Running   0          46m
kube-system          kindnet-s2mpv                                       1/1     Running   0          46m
kube-system          kindnet-tx4mb                                       1/1     Running   0          46m
kube-system          kube-apiserver-kongcluster-control-plane            1/1     Running   0          46m
kube-system          kube-controller-manager-kongcluster-control-plane   1/1     Running   0          46m
kube-system          kube-proxy-dvg62                                    1/1     Running   0          46m
kube-system          kube-proxy-z8d62                                    1/1     Running   0          46m
kube-system          kube-scheduler-kongcluster-control-plane            1/1     Running   0          46m
local-path-storage   local-path-provisioner-5ddd94ff66-pdj5h             1/1     Running   0          46m
```

Esto se ve bien, todos los pods están `Running` :), en su mayoría son los servicios del cluster:

* kube-apiserver
* kube-scheduler
* kube-proxy
* kube-controller-manager
* etcd
* kindnet
* coredns
* local-path-provisioner

Todo indica a que el cluster tiene todo listo para desplegar nuestras aplicaciones.

## Despliegue de Kong

Instalaremos Kong con base de datos postgres para almacenar todas las configuraciones.

Usando helm, agregamos el repositorio de kong:

```shell
$ helm repo add kong https://charts.konghq.com
```

Ahora actualizamos los repositorios:

```shell
$ helm repo update
```

Creamos un namespace para kong:

```shell
$ kubectl create namespace kong
namespace/kong created
```

Listamos los namespaces:

```shell
$ kubectl get namespace kong
NAME   STATUS   AGE
kong   Active   1s
```

Ejecutamos la instalación con los parámetros personalizados para habilitar el servicio de admin y postgresql:

```shell
$ helm install api-gateway -n kong kong/kong \
  --set ingressController.installCRDs=false \
  --set admin.enabled=true \
  --set admin.type=ClusterIP \
  --set admin.http.enabled=true \
  --set admin.tls.enabled=false \
  --set env.database=postgres \
  --set postgresql.enabled=true
  NAME: api-gateway
LAST DEPLOYED: Fri Aug  5 09:51:02 2022
NAMESPACE: kong
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
To connect to Kong, please execute the following commands:

HOST=$(kubectl get svc --namespace kong api-gateway-kong-proxy -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
PORT=$(kubectl get svc --namespace kong api-gateway-kong-proxy -o jsonpath='{.spec.ports[0].port}')
export PROXY_IP=${HOST}:${PORT}
curl $PROXY_IP

Once installed, please follow along the getting started guide to start using
Kong: https://docs.konghq.com/kubernetes-ingress-controller/latest/guides/getting-started/
```

Esta instalación de Kong crea varios recursos de tipo `CRD` ó `Custom Resource Definition` que se usan
para configurar los recursos de kong de forma declarativa. Además se crean cuentas de servicio y los roles
de acceso, así como un secreto, los servicios de red, el deployment y un ingress class.

Listemos los recursos en el namespace de kong:

```shell
$ kubectl -n kong get all
NAME                                         READY   STATUS      RESTARTS   AGE
pod/api-gateway-kong-5f8d97b9c5-dp4rw        2/2     Running     0          7m
pod/api-gateway-kong-init-migrations-gmc7s   0/1     Completed   0          7m
pod/api-gateway-postgresql-0                 1/1     Running     0          7m

NAME                                TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
service/api-gateway-kong-admin      ClusterIP      10.96.100.125   <none>        8001/TCP                     7m
service/api-gateway-kong-proxy      LoadBalancer   10.96.39.118    <pending>     80:30448/TCP,443:32649/TCP   7m
service/api-gateway-postgresql      ClusterIP      10.96.10.142    <none>        5432/TCP                     7m
service/api-gateway-postgresql-hl   ClusterIP      None            <none>        5432/TCP                     7m

NAME                               READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/api-gateway-kong   1/1     1            1           7m

NAME                                          DESIRED   CURRENT   READY   AGE
replicaset.apps/api-gateway-kong-5f8d97b9c5   1         1         1       7m

NAME                                      READY   AGE
statefulset.apps/api-gateway-postgresql   1/1     7m

NAME                                         COMPLETIONS   DURATION   AGE
job.batch/api-gateway-kong-init-migrations   1/1           40s        7m
```

En el listado vemos que hay un deployment llamado `api-gateway-kong`, el cual los siguientes pods:

* api-gateway-kong
* api-gateway-kong-init-migrations
* api-gateway-postgresql

La base de datos se levanta y se configura con credenciales default en el pod `api-gateway-postgresql`. El pod
`api-gateway-initmigrations` solo se ejecuta una vez para inicializar y configurar la base de datos postgres.
Finalmente el pod `api-gateway-kong` es el servidor principal de kong.

En el listado de servicios, el servicio `api-gateway-kong-admin` es de tipo `ClusterIP` en el puerto `8001`. También
se puede ver el servicio `api-gateway-kong-proxy` de tipo `LoadBalancer` y mapea el puerto `30448` al `80`,
y el `30428` al `443` en TCP. Necesitamos cambiar esos puertos para que hagan coincidencia con los que definimos
en el port mapping al crear el cluster.

Actualizamos la configuración del servicio kong admin:

```shell
$ kubectl -n kong patch service api-gateway-kong-admin --patch-file kong/patch-service-admin-nodeport.yml
service/api-gateway-kong-admin patched
```

También actualizamos el servicio kong proxy:

```shell
$ kubectl -n kong patch service api-gateway-kong-proxy --patch-file kong/patch-service-proxy-nodeport.yml
service/api-gateway-kong-proxy patched
```

Ahora listamos para ver los cambios:

```shell
$ kubectl -n kong get services | grep api-gateway-kong
api-gateway-kong-admin      NodePort    10.96.157.9     <none>        8001:32581/TCP               12m
api-gateway-kong-proxy      NodePort    10.96.209.152   <none>        80:31682/TCP,443:32527/TCP   12m
```

Como se puede ver ya se usan los puertos que definimos al inicio.

Hagamos una petición a kong al puerto TCP/80 donde se exponen los servicios:

```shell
$ curl http://localhost/
{"message":"no Route matched with those values"}
```

También podemos hacer una petición a la API de administración de Kong:

```shell
$ curl http://localhost:8001/
{"configuration":{"go_pluginserver_exe":"/usr/local/bin/go-pluginserver","mem_cache_size":"128m","db_cache_warmup_entities":["services"],"headers":["server_tokens","latency_tokens"],"worker_consistency":"strict","nginx_events_directives":[{"name":"multi_accept","value":"on"},{"name":"worker_connections","value":"auto"}],"nginx_http_directives":[{"name":"client_body_buffer_size","value":"8k"},{"name":"client_max_body_size","value":"0"}..."tagline":"Welcome to kong","timers":{"running":0,"pending":10},"pids":{"workers":[1114,1115],"master":1}}
```

Listo!!! Ya tenemos Kong instalado y listo para usarse.

## Despliegue aplicación

Realizamos el despliegue de una aplicación:

```shell
$ kubectl apply -f whoami/1_deployment.yml
```

Creamos el service de una aplicación:

```shell
$ kubectl apply -f whoami/2_service.yml
```

Creamos el ingress de una aplicación:

```shell
$ kubectl apply -f whoami/3_ingress.yml
```

Esperamos unos segundos a que levanten los servicios y continuamos con la validaciones.

## Validación aplicación

Ahora validamos listando todos los recursos del namespace `default`:

```shell
$ kubectl -n default get all
NAME                          READY   STATUS    RESTARTS   AGE
pod/whoami-6977d564f9-dq5pr   1/1     Running   0          2m35s

NAME                 TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)    AGE
service/kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP    4m51s
service/whoami       ClusterIP   10.96.27.189   <none>        8080/TCP   2m24s

NAME                     READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/whoami   1/1     1            1           2m35s

NAME                                DESIRED   CURRENT   READY   AGE
replicaset.apps/whoami-6977d564f9   1         1         1       2m35s
```

Como se puede ver se tiene los recursos `deployment`, el `replicaset`, los `pods` y el `service`.

Ahora validamos que responda el servicio whoami a través de kong:

```shell
$ curl http://localhost/whoami
Hostname: whoami-6977d564f9-dq5pr
IP: 127.0.0.1
IP: ::1
IP: 10.244.1.3
IP: fe80::dc3f:a9ff:fe84:9283
RemoteAddr: 10.244.1.2:58086
GET / HTTP/1.1
Host: localhost
User-Agent: curl/7.64.1
Accept: */*
Connection: keep-alive
X-Forwarded-For: 10.244.1.1
X-Forwarded-Host: localhost
X-Forwarded-Path: /whoami
X-Forwarded-Port: 80
X-Forwarded-Prefix: /whoami
X-Forwarded-Proto: http
X-Real-Ip: 10.244.1.1
```

Listo!, ya tenemos una respuesta de `whoami`.

## Pruebas de carga a la aplicación web

Usaremos `k6` para realizar pruebas de carga en la aplicación que exponemos a través de kong:

Ahora ejecutamos el script con las pruebas:

```shell
$ k6 run k6/script.js
```

## Limpieza

Para destruir el cluster ejecutamos:

```shell
$ kind delete cluster kongcluster
Deleting cluster "kongcluster" ...
```

También podemos limpiar colima:

```shell
$ colima delete
are you sure you want to delete colima and all settings? [y/N] y
INFO[0001] deleting colima
INFO[0001] deleting ...                                  context=docker
INFO[0001] done
```

Y listo todo se ha terminado.

## Problemas conocidos

Si usas una mac m1 es probable que tengas errores al descargar las imágenes de los contenedores, si es un error
relacionado a resolución de nombres DNS, puedes probar agregando la configuración de `lima` para que no use
el dns del host y en su lugar use el de google, por ejemplo:

Creamos configuración para dns de lima:

```shell
$ vim ~/.lima/_config/override.yaml
```

Con el siguiente contenido:

```shell
useHostResolver: false
dns:
  - 8.8.8.8
```

Se recomienda que hagas un reset de colima, haciendo delete, y nuevamente start.

También puedes iniciar colima con la opción `--dns`, por ejemplo:

```shell
$ colima start --dns 8.8.8.8
```

## Comandos útiles

Listado versiones:

* kubectl version

Listado contextos:

* kubectl config get-contexts

Detalles de cluster:

* kubectl cluster-info

Gestión de nodos:

* kubectl get nodes
* kubectl describe node NODENAME

Gestión de pods:

* kubectl get pods
* kubectl describe pod PODNAME
* kubectl logs PODNAME
* kubectl delete pod PODNAME

Gestión de services:

* kubectl get services
* kubectl describe service SVCNAME
* kubectl delete service SVCNAME

Gestión de namespaces:

* kubectl get namespaces
* kubectl describe namespace NSNAME
* kubectl delete namespace NSNAME

Gestión de recursos en modo declarativo:

* kubectl apply -f YAMLFILE
* kubectl delete -f YAMLFILE

Gestión de deployments:

* kubectl get deployment
* kubectl describe deployment PODNAME
* kubectl delete deployment PODNAME

Gestión charts:

* helm ls
* helm install CHARTNAME
* helm uninstall CHARTNAME

## Referencias

La siguiente es una lista de referencias externas que pueden serle de utilidad:

* [Colima - container runtimes on macOS (and Linux) with minimal setup](https://github.com/abiosoft/colima)
* [Kubernetes - Orquestación de contenedores para producción](https://kubernetes.io/es/)
* [kind - home](https://kind.sigs.k8s.io/)
* [kind - quick start](https://kind.sigs.k8s.io/docs/user/quick-start/)
* [Kong Ingress Controller](https://docs.konghq.com/kubernetes-ingress-controller/latest/)
* [Kindest - node images repository](https://hub.docker.com/r/kindest/node/tags)
* [Kong - Getting started guide](https://docs.konghq.com/kubernetes-ingress-controller/latest/guides/getting-started/)
* [Kong - Admin API](https://docs.konghq.com/gateway/latest/admin-api/)
