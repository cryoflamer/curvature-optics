# Supply a reviewed immutable Microsoft Playwright Python 1.57.0 base digest.
ARG PLAYWRIGHT_BASE
FROM ${PLAYWRIGHT_BASE}
ARG SOURCE_REVISION
USER root
COPY .local-mcp/browser-requirements.txt /opt/browser-requirements.txt
RUN python3 -m venv /opt/mcp-browser \
    && /opt/mcp-browser/bin/python -m pip install --no-cache-dir --only-binary=:all: \
       -r /opt/browser-requirements.txt \
    && /opt/mcp-browser/bin/python -m pip check
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Build context must be git archive of SOURCE_REVISION, never the working tree.
# No repository test or script is executed during the privileged build.
COPY . /opt/curvature/
LABEL io.local-mcp-gateway.source-revision=${SOURCE_REVISION}
USER 10001:10001
