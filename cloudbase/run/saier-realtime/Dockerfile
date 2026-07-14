FROM node:22-alpine AS dependencies
WORKDIR /app
COPY cloudbase/run/saier-realtime/package.json ./package.json
RUN npm install --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY cloudbase/run/saier-realtime/gateway-core.cjs ./gateway-core.cjs
COPY cloudbase/run/saier-realtime/server.cjs ./server.cjs
COPY cloudbase/functions/saier-room-api ./authority
USER node
EXPOSE 8080
CMD ["node", "server.cjs"]
