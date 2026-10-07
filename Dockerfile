FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app /tmp/mem && chown -R node:node /app /tmp/mem

# مستخدم node الموجود مسبقاً (uid 1000) — بلا صلاحيات root
USER node
ENV PATH="/home/node/.opencode/bin:${PATH}"
RUN curl -fsSL https://opencode.ai/install | bash

WORKDIR /app
COPY --chown=node:node . /app
RUN chmod +x /app/start.sh /app/sync.sh

ENV PORT=10000 CLI_PATH=opencode PROJECT_DIR=/app
EXPOSE 10000
CMD ["./start.sh"]
