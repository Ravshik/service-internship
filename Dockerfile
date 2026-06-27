FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY index.html ./
COPY puzzlebot-embed.html ./
COPY nginx.conf ./

RUN mkdir -p /app/data

ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["npm", "start"]
