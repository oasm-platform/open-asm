FROM node:22-alpine AS base
# Install BASH to make our lives easier for entrypoint.sh...
RUN apk add --no-cache curl bash && \
    npm install -g serve && \
    npm install -g bun@1.3

WORKDIR /app

FROM base AS builder

COPY package.json ./

ENV NODE_ENV production

COPY . .
RUN bun install

RUN \
  VITE_API_URL=APP_VITE_API_URL \
  bun run build

# Clean bun cache and remove unused files
RUN bun pm cache clean && rm -rf src test

FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]