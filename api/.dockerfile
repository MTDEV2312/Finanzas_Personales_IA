FROM oven/bun:1

WORKDIR /app

COPY bun.lock package.json ./
RUN bun install --production

COPY . .

EXPOSE 3002
CMD ["bun", "run", "start"]
