FROM node:18-alpine

RUN apk add --no-cache postgresql-client openssl bash docker-cli

WORKDIR /securebackup/backend

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
