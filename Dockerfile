FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npx playwright install chromium

COPY src/ ./src/
COPY .env.example ./.env

ENV NODE_ENV=production
ENV HEADLESS=true

EXPOSE 3000

CMD ["node", "src/server.js"]
