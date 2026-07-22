FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY demo_data_generator ./demo_data_generator
ENV DEMO_GENERATOR_ENABLED=false
CMD ["node", "demo_data_generator/server.js"]
