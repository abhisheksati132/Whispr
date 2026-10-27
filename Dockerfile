FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Run as non-root user
USER node

EXPOSE 3000

CMD ["node", "server/index.js"]
