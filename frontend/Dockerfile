# syntax=docker/dockerfile:1

# ---- dev: Vite dev server(ソースと node_modules はボリューム。起動時に依存を同期する) ----
FROM node:22-alpine AS dev
WORKDIR /workspace/frontend
RUN mkdir -p /workspace/frontend/node_modules && chown -R node:node /workspace
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: 静的ファイルを作る ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- prod: nginx で静的配信し、/api は backend へプロキシ ----
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
