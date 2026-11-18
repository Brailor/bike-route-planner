# The API (ADR 0015): logins, and later saved routes and flags. Node runs the TypeScript sources as they are and
# has SQLite built in, so there's nothing to install or build. The database file lives in data/, a volume.
FROM node:26.13.0-slim
WORKDIR /srv/api
COPY src src
RUN mkdir data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "src/main.ts"]
