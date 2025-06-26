# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY ./core-api/package*.json ./
RUN npm install

COPY ./core-api ./
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY ./core-api/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 6276

CMD ["node", "dist/main.js"]
