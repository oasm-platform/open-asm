FROM node:26-alpine AS base
# Install BASH to make our lives easier for entrypoint.sh...
RUN apk add --no-cache curl bash && \
    npm install -g serve
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN npm install -g corepack && corepack enable

WORKDIR /app

FROM base AS builder

WORKDIR /app

# Copy root workspace config and console package.json
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY console/package.json ./console/package.json

# Install all dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy console source code
COPY console/ ./console/

# Build
RUN \
  VITE_API_URL=APP_VITE_API_URL \
  pnpm --filter console run build

# Clean source and unused files
RUN rm -rf src test

FROM nginx:stable-alpine

COPY --from=builder /app/console/dist /usr/share/nginx/html
COPY ./console/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
