FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 nibras
USER nibras
ENV PATH="/home/nibras/.opencode/bin:${PATH}"
RUN curl -fsSL https://opencode.ai/install | bash

WORKDIR /app
COPY --chown=nibras:nibras . /app
RUN chmod +x /app/start.sh /app/sync.sh

ENV PORT=10000 CLI_PATH=opencode PROJECT_DIR=/app
EXPOSE 10000
CMD ["./start.sh"]
