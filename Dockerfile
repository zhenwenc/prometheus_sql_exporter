FROM node:8.2.1-alpine

RUN npm install -g ts-node typescript

WORKDIR /app

COPY tsconfig.json /app/
COPY package-lock.json /app/
COPY package.json /app/
COPY src /app/src/

RUN npm install

EXPOSE 8080

ENTRYPOINT ["ts-node", "/app/src/Main.ts"]
