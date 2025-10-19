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

FROM base AS runner

ENV NODE_ENV production

# https://devpress.csdn.net/cloudnative/62f319d77e66823466186213.html
# https://www.tomoliver.net/posts/nextjs-docker-public-env-vars
# Handle Entrypoint
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
############

COPY --from=builder /app/dist ./

CMD ["serve", "-s", "."]