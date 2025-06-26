FROM oven/bun:1.1.13 as builder

WORKDIR /app

COPY . .

RUN bun install

RUN bun build index.ts --outdir dist

FROM oven/bun:1.1.13 as runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bun.lockb ./
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

CMD ["bun", "dist/index.js"]
