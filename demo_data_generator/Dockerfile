FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY demo_data_generator ./demo_data_generator
ENV GENERATOR_ENABLED=false \
    SCHEDULER_ENABLED=false \
    DEMO_ENABLED=false \
    ALLOW_NORMAL_GENERATION=false \
    ALLOW_ACCELERATED_DEMO=false \
    NODE_ENV=production
CMD ["node", "demo_data_generator/server.js"]
