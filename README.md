# Docker Learning

A small full-stack app used to learn Docker: a React UI, a Node/Express API and MongoDB, all run with Docker Compose.

```
browser ──► react-app (nginx :80) ──/api/*──► node-app (Express :3000) ──► mongodb (:27017)
                                                                              ▲
                                              mongo-express (:8081) ──────────┘
```

| Service         | What it is                                 | Host URL                |
|-----------------|--------------------------------------------|-------------------------|
| `react-app`     | Vite + React UI, built and served by nginx | http://localhost:3000   |
| `node-app`      | Express REST API (`/items`, `/health`)     | http://localhost:3001   |
| `mongodb`       | Database, data kept in the `mongo-data` volume | `localhost:27017`   |
| `mongo-express` | Web UI for browsing MongoDB                | http://localhost:8080   |

Mongo credentials (`admin` / `password`) are hard-coded for learning only. Do not reuse them anywhere real.

## Run the project

Only Docker is required. Node is not needed on the host.

```sh
docker compose up -d --build     # build images and start everything
docker compose ps                # check status and ports
docker compose logs -f node-app  # follow one service's logs (Ctrl+C to stop following)
docker compose down              # stop and remove containers and network (data is kept)
```

Then open http://localhost:3000.

### Everyday commands

```sh
docker compose up -d --build react-app   # rebuild and restart one service after code changes
docker compose restart node-app          # restart without rebuilding
docker compose exec mongodb mongosh -u admin -p password   # open a Mongo shell
docker compose down --remove-orphans     # also remove containers for services no longer in the file
docker compose down -v                   # DANGER: also deletes volumes, i.e. all database data
```

### Try the API directly

```sh
curl localhost:3001/health
curl localhost:3001/items
curl -X POST localhost:3001/items -H 'content-type: application/json' -d '{"name":"hello"}'
curl -X PATCH localhost:3001/items/<id> -H 'content-type: application/json' -d '{"done":true}'
curl -X DELETE localhost:3001/items/<id>
# the same API through the React container's proxy:
curl localhost:3000/api/items
```

### Inspect Docker state

```sh
docker ps                                  # running containers
docker images                              # local images
docker volume ls                           # volumes
docker network ls                          # networks
docker inspect mongodb --format '{{range .Mounts}}{{.Type}} {{.Name}} -> {{.Destination}}{{"\n"}}{{end}}'
```

## Run from Docker Hub (no build)

[docker-compose.hub.yml](docker-compose.hub.yml) runs the same stack using only pre-built images, so a tester needs just that one file and Docker:

```sh
docker compose -f docker-compose.hub.yml up -d      # pulls and starts everything
docker compose -f docker-compose.hub.yml down       # stop (data is kept)
```

It uses `majidaliwatto/node-app:latest` and `majidaliwatto/react-app:latest` (both must be public, or the tester must `docker login`). The UI is at http://localhost:3000, same as the local stack.

It uses the same host ports as `docker-compose.yml`, so stop one stack before starting the other. It has its own project name (`docker-learning-hub`), network and `mongo-data` volume, so it starts with an empty database and never touches the local stack's data.

### Publish your own images

```sh
docker login
docker tag docker-learning-node-app:latest majidaliwatto/node-app:latest
docker tag docker-learning-react-app:latest majidaliwatto/react-app:latest
docker push majidaliwatto/node-app:latest
docker push majidaliwatto/react-app:latest
```

Re-tag and push again after every rebuild; the hub compose file only sees what is on Docker Hub. Use a version tag (for example `:1.0`) instead of `latest` when you want testers to stay on a fixed build.

## Project layout

```
docker-compose.yml       local stack: builds node-app and react-app from source
docker-compose.hub.yml   same stack, pulls pre-built images from Docker Hub
commands.txt             the manual docker run commands this setup replaces
.gitignore               keeps node_modules/, dist/ and .env out of git
node-app/                Express API: index.js, Dockerfile, .dockerignore
react-app/               React UI: src/, nginx.conf, Dockerfile, .dockerignore
```

## Concepts covered

**Images and containers.** An image is a built, read-only template; a container is a running instance of it. `mongo` and `mongo-express` come from Docker Hub; `node-app` and `react-app` are built from this repo.

**Dockerfile.** The recipe for an image: `FROM` (base image), `WORKDIR`, `COPY`, `RUN` (build-time commands), `EXPOSE` (documents the port), `CMD` (the command the container runs). See [node-app/Dockerfile](node-app/Dockerfile).

**Layer caching.** Each instruction is a cached layer. Both Dockerfiles copy `package*.json` and install dependencies *before* copying the source, so editing code does not re-run the install.

**`npm ci` and the lockfile.** `npm ci` installs exactly what `package-lock.json` says and fails without it, which makes builds reproducible. `--omit=dev` keeps dev dependencies out of the API image.

**`.dockerignore`.** Keeps files out of the build context. It stops a host `node_modules` from overwriting the one installed inside the image by `COPY . .`.

**Build context.** `build: ./node-app` is shorthand for `context: ./node-app` plus `dockerfile: Dockerfile`. The context is the folder sent to Docker; `COPY` paths are relative to it.

**Multi-stage builds.** [react-app/Dockerfile](react-app/Dockerfile) has two stages: a Node stage that builds the static site, and a small nginx stage that receives only the built `dist/`. The final image has no Node, no source and no `node_modules`.

**Docker-only development.** The React app has no local `node_modules`. Its lockfile was generated in a throwaway container: `docker run --rm -v "$PWD":/app -w /app node:24-slim npm install --package-lock-only <pkg>`.

**Docker Compose.** One file describes the whole stack. `docker compose up` creates the network, volume and containers in dependency order.

**Networks and service discovery.** All services share the `mongo-net` bridge network. Containers reach each other by service name, which is why the API connects to `mongodb://...@mongodb:27017` and nginx proxies to `node-app:3000`. `localhost` inside a container means the container itself.

**Port mapping.** `"3001:3000"` is `host:container`. Only mapped ports are reachable from the host. Container ports can be the same across services; host ports cannot clash (a host port was already taken by another process here, hence 3001 for the API).

**Environment variables.** Configuration is passed at runtime (`MONGO_URL`, `MONGO_INITDB_ROOT_*`), so one image works in any environment.

**`depends_on` and `restart`.** `depends_on` controls start *order*, not readiness. `restart: on-failure` on the API covers the case where Mongo is not accepting connections yet.

**Reverse proxy with nginx.** [react-app/nginx.conf](react-app/nginx.conf) serves the built UI, forwards `/api/*` to the API (stripping `/api`), and falls back to `index.html` for client-side routes. The browser only talks to one origin, so no CORS config is needed.

**Volumes and persistence.** A container's filesystem is deleted with the container. Mongo's data lives in the named volume `mongo-data`, so it survives `down`, rebuilds and restarts. Without a named volume the `mongo` image creates an anonymous volume, which looks lost after `down` + `up` because a new one is created. Only `down -v` or `docker volume rm` deletes a named volume.

**Orphans.** Renaming or removing a service leaves its old container behind; `--remove-orphans` cleans it up.

**Registries and image names.** An image name is `[registry/]namespace/repository:tag`. On Docker Hub your username is the namespace, so `majidaliwatto/node-app:latest` means `docker.io/majidaliwatto/node-app:latest`. Official images such as `mongo` live in the special `library` namespace, which is why they have no username. You cannot push `react-app` without a namespace, because it resolves to `library/react-app`, which you cannot write to.

**Tagging, pushing and pulling.** `docker push` publishes a *local image with that exact name*, so tag it first (`docker tag <local-name> <user>/<repo>:<tag>`); otherwise you get "tag does not exist". `latest` is just the default tag, not a guarantee of newest; use explicit versions for reproducibility.

**Public vs private repositories.** Public images are pullable by anyone without login, and anyone can read the code inside. Private ones need `docker login` for every puller. Never bake secrets into an image; pass them as runtime environment variables.

**`image:` vs `build:` in Compose.** `build:` creates the image from source; `image:` only pulls it. [docker-compose.hub.yml](docker-compose.hub.yml) uses `image:` exclusively, with `pull_policy: always` so each `up` fetches the latest published version instead of reusing a stale local copy.

**Compose project names.** Compose prefixes networks, volumes and containers with the project name (the folder name by default). Setting `name:` in the hub file keeps its resources separate from the local stack. Fixed `container_name`s are omitted there for the same reason, since they must be globally unique.

**Cleaning up.** `docker rmi <image>` removes one image; `docker image prune` removes *all* dangling images on the machine, including those from other projects, so remove project images by name instead.

## Troubleshooting

- **Port already in use.** Find the owner with `ss -ltnp | grep :3000`, then stop it or change the left side of the mapping in `docker-compose.yml`.
- **API container keeps restarting.** Check `docker compose logs node-app`; usually Mongo is still starting or `MONGO_URL` is wrong.
- **Changes to the React app do not show.** It is a production build; rebuild with `docker compose up -d --build react-app`.
- **`docker push` says "tag does not exist".** No local image has that exact name. Compose names built images `<project>-<service>` (for example `docker-learning-node-app`), so run `docker tag` first.
- **`docker push` says "denied" or "requested access".** Run `docker login`, and make sure the name starts with your Docker Hub username.
- **Hub stack shows old behaviour.** The images on Docker Hub are only updated by pushing; rebuilding locally does not change them.
