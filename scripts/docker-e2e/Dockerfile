FROM node:22-alpine

RUN apk add --no-cache python3 make g++ git gettext

RUN npm install -g pnpm

WORKDIR /app

COPY setup.sh /setup.sh
RUN chmod +x /setup.sh

ENTRYPOINT ["/setup.sh"]
CMD ["pnpm", "run", "test:ai:behavior"]
