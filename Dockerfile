FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g opencode@2.0.14

RUN useradd -m -u 1000 nibras
WORKDIR /app
COPY --chown=nibras:nibras . /app
RUN chmod +x /app/start.sh /app/sync.sh

USER nibras
ENV PORT=10000 CLI_PATH=opencode PROJECT_DIR=/app
EXPOSE 10000
CMD ["./start.sh"]
