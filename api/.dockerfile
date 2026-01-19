FROM oven/bun:1

WORKDIR /app

COPY api/bun.lock api/package.json ./
RUN bun install --production

COPY . .

EXPOSE 3002
CMD ["bun", "run", "start"]
