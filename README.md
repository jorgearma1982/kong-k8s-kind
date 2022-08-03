# Kong en Kubernetes con kind

## Introducción

En este documento mostramos como instalar un cluster kubernetes en la laptop usando la implementación
de `kind`, la cual corre cada componente en un contenedor en lugar de usar máquinas virtuales, originalmente
fue diseñado para probar kubernetes en sí, pero puede ser usado para desarrollo local ó CI.

Instalaremos Kong como Ingress Controller y una aplicación web simple para validar la funcionalidad de Kong.

## Requisitos

Es necesario tener instalado y en ejecución docker para poder gestionar contenedores, este ejercicio lo
realizaremos en un equipo con macos, por lo que instalaremos la implementación `colima` para correr docker
en local, si tienes linux puedes instalar docker usando tu manejador de paquetes favorito.

Instalamos colima y el cliente docker:

```shell
$ brew install colima docker
```

Iniciamos colima:

```shell
$ colima start
```

Ahora instalamos los paquetes para kubernetes con `kind`, también instalamos el cliente `kubectl`:

```shell
$ brew install kind kubectl
```

También instalemos la herramienta de pruebas de carga para aplicaciones web:

```shell
$ brew install k6
```

Validamos la instalación de kind:

```shell
$ kind --version
kind version 0.14.0
```

## Instalación de cluster

Definimos la configuración del cluster con dos nodos, uno con rol de `control-plane` y otro de `worker`:

```
$ cat kind/cluster-multi-ingress.yaml
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
    - containerPort: 32527
      hostPort: 443
      listenAddress: "127.0.0.1"
      protocol: TCP

```

En la configuración de arriba podemos ver para el role `worker` se define un re dirección de puertos extra, esto
básicamente hace un port forward del puerto en el host hacia el puerto en un servicio dentro del cluster,
se re direcciona el puerto TCP `31682` al `80` para conexiones HTTP y el TCP `32527` al `443` para el HTTPS.

Note también que los puertos que se re direccionan se asocian a la dirección local `127.0.0.1`.

Ahora creamos el cluster versión `1.23.4` con la configuración en el archivo `kind/cluster-multi-ingress.yml`:

```shell
$ kind create cluster --image kindest/node:v1.23.4 --config=kind/cluster-multi-ingress.yml
Creating cluster "kind" ...
 ✓ Ensuring node image (kindest/node:v1.23.4) 🖼
 ✓ Preparing nodes 📦 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
 ✓ Joining worker nodes 🚜
Set kubectl context to "kind-kind"
You can now use your cluster with:

kubectl cluster-info --context kind-kind

Thanks for using kind! 😊
```

Listo!! Ya tenemos un cluster con un nodo de control plane y un worker, hagamos un listado de los clusters de kind:

```shell
$ kind get clusters
kind
```

Como se puede ver tenemos un cluster llamado `kind`.

Veamos que pasó a nivel contenedores docker:

```shell
$ docker ps
CONTAINER ID   IMAGE                  COMMAND                  CREATED         STATUS         PORTS                       NAMES
f9cfa676cce8   kindest/node:v1.23.4   "/usr/local/bin/entr…"   2 minutes ago   Up 2 minutes   127.0.0.1:55278->6443/tcp   kind-control-plane
210646ab5d60   kindest/node:v1.23.4   "/usr/local/bin/entr…"   2 minutes ago   Up 2 minutes                               kind-worker
```

Como se puede ver hay dos contenedores en ejecución asociados a los nodos del cluster.

## Validación del cluster

Además de que el proceso de instalación fue super rápido, kind ya agregó un contexto a la configuración de
`kubectl` local:

```shell
$ kubectl config get-contexts
CURRENT   NAME                       CLUSTER           AUTHINFO       NAMESPACE
*         kind-kind                  kind-kind         kind-kind
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
$ k get nodes
NAME                 STATUS   ROLES                  AGE     VERSION
kind-control-plane   Ready    control-plane,master   5m42s   v1.23.4
kind-worker          Ready    <none>                 5m11s   v1.23.4
```

Como se puede ver tenemos un nodo que es el maestro, es decir, la capa de control, y tenemos otro que es el worker.

Listemos los pods de los servicios que están en ejecución:

```shell
$ k get pods -A
NAMESPACE            NAME                                         READY   STATUS             RESTARTS   AGE
kube-system          coredns-64897985d-7pxk8                      1/1     Running            0          10m
kube-system          coredns-64897985d-7qlk2                      1/1     Running            0          10m
kube-system          etcd-kind-control-plane                      1/1     Running            0          10m
kube-system          kindnet-5x48k                                1/1     Running            0          10m
kube-system          kindnet-ctj24                                1/1     Running            0          10m
kube-system          kube-apiserver-kind-control-plane            1/1     Running            0          10m
kube-system          kube-controller-manager-kind-control-plane   1/1     Running            0          10m
kube-system          kube-proxy-cf544                             1/1     Running            0          10m
kube-system          kube-proxy-grnxt                             1/1     Running            0          10m
kube-system          kube-scheduler-kind-control-plane            1/1     Running            0          10m
local-path-storage   local-path-provisioner-5ddd94ff66-6x26q      1/1     Running            0          10m
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

Instalamos Kong en modo dbless para hacer una instalación sencilla sin base de datos:

```shell
$ kubectl apply -f https://raw.githubusercontent.com/Kong/kubernetes-ingress-controller/master/deploy/single/all-in-one-dbless.yaml
namespace/kong created
customresourcedefinition.apiextensions.k8s.io/kongclusterplugins.configuration.konghq.com created
customresourcedefinition.apiextensions.k8s.io/kongconsumers.configuration.konghq.com created
customresourcedefinition.apiextensions.k8s.io/kongingresses.configuration.konghq.com created
customresourcedefinition.apiextensions.k8s.io/kongplugins.configuration.konghq.com created
customresourcedefinition.apiextensions.k8s.io/tcpingresses.configuration.konghq.com created
customresourcedefinition.apiextensions.k8s.io/udpingresses.configuration.konghq.com created
serviceaccount/kong-serviceaccount created
role.rbac.authorization.k8s.io/kong-leader-election created
clusterrole.rbac.authorization.k8s.io/kong-ingress created
clusterrole.rbac.authorization.k8s.io/kong-ingress-gateway created
clusterrole.rbac.authorization.k8s.io/kong-ingress-knative created
rolebinding.rbac.authorization.k8s.io/kong-leader-election created
clusterrolebinding.rbac.authorization.k8s.io/kong-ingress created
clusterrolebinding.rbac.authorization.k8s.io/kong-ingress-gateway created
clusterrolebinding.rbac.authorization.k8s.io/kong-ingress-knative created
secret/kong-serviceaccount-token created
service/kong-proxy created
service/kong-validation-webhook created
deployment.apps/ingress-kong created
ingressclass.networking.k8s.io/kong created
```

Como se puede ver, se crea un namespace llamado `kong` y varios `CRD` ó `Custom Resource Definition` que se usan
para configurar los recursos de kong de forma declarativa. Además se crean cuentas de servicio y los roles
de acceso, así como un secreto, los servicios de red, el deployment y un ingress class.

Listemos los recursos en el namespace de kong:

```shell
$ k -n kong get all
NAME                                READY   STATUS    RESTARTS   AGE
pod/ingress-kong-7c4bd5dc74-zjmqr   2/2     Running   0          43s

NAME                              TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
service/kong-proxy                LoadBalancer   10.96.180.195   <pending>     80:30721/TCP,443:30428/TCP   43s
service/kong-validation-webhook   ClusterIP      10.96.157.114   <none>        443/TCP                      43s

NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/ingress-kong   1/1     1            1           43s

NAME                                      DESIRED   CURRENT   READY   AGE
replicaset.apps/ingress-kong-7c4bd5dc74   1         1         1       43s
```

Como se puede ver el servicio `kong-proxy` es de tipo `LoadBalancer` y mapea el puerto `30721` al `80`, y el
`30428` al `443` en TCP. Necesitamos cambiar esos puertos para que hagan coincidencia con los que definimos
en el port maping al crear el cluster.

```shell
$ kubectl -n kong patch service kong-proxy --patch-file kong/patch-service-nodeport.yml
```

```shell
$ kubectl -n kong get service kong-proxy
NAME         TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
kong-proxy   NodePort   10.96.180.195   <none>        80:31682/TCP,443:32527/TCP   4m13s
```

Como se puede ver ya se usan los puertos que definimos al inicio.

Hagamos una petición a kong:

```shell
$ curl http://localhost/
{"message":"no Route matched with those values"}
```

Listo!!! ya tenemos kong instalado y listo para usarse.

## Despliegue aplicación

Realizamos el despliegue de una aplicación:

```shell
$ kubectl apply -f echo/1_deployment.yml
```

Creamos el service de una aplicación:

```shell
$ kubectl apply -f echo/2_service.yml
```

Creamos el ingress de una aplicación:

```shell
$ kubectl apply -f echo/3_ingress.yml
```

## Validación aplicación

Ahora validamos listando todos los recursos del namespace `default`:

```shell
$ k -n default get all
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
$ kind delete cluster
Deleting cluster "kind" ...
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

## Referencias

La siguiente es una lista de referencias externas que pueden serle de utilidad:

* [kind - home](https://kind.sigs.k8s.io/)
* [kind - quick start](https://kind.sigs.k8s.io/docs/user/quick-start/)
