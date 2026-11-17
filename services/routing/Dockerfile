# GraphHopper with this repo's config and models (ADR 0013). The graph is data, not part of the image: mount a
# prepared graph-cache (built by `pnpm routing:start`) at /srv/routing/data/graph-cache. Read-write: the engine puts a
# lock file in it even to read it; the graph files themselves stay unchanged.
FROM eclipse-temurin:25.0.4.1_1-jre-noble

WORKDIR /srv/routing
ADD --checksum=sha256:8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33 \
  https://github.com/graphhopper/graphhopper/releases/download/11.1/graphhopper-web-11.1.jar ./
COPY config.yml ./
COPY models models
COPY scripts/start.sh scripts/
# data/ holds the mounted graph and the engine's own logs; the logs stay inside the container.
RUN mkdir -p data/logs && chown -R ubuntu:ubuntu data && chmod 644 graphhopper-web-11.1.jar

USER ubuntu
# Reachable by the other containers; the admin port stays on localhost (config.yml). The graph is read from disk
# (MMAP), which needs a small heap: whole in memory it needs a 5 GB heap and starts no faster routes (ADR 0013).
ENV GH_BIND_HOST=0.0.0.0 \
  GH_DATAACCESS=MMAP \
  GH_HEAP=1g
EXPOSE 8989
CMD ["scripts/start.sh"]
