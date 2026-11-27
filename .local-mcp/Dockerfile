# Supply a reviewed immutable Microsoft Playwright Python 1.57.0 base digest.
ARG PLAYWRIGHT_BASE
FROM ${PLAYWRIGHT_BASE}
ARG SOURCE_REVISION
USER root
COPY .local-mcp/browser-requirements.txt /opt/browser-requirements.txt
# The official base has pip but lacks ensurepip/python3-venv.
# Populate an isolated environment using the base image's pip.
RUN python3 -m venv --without-pip /opt/mcp-browser \
    && python3 -m pip --isolated --python /opt/mcp-browser/bin/python install --no-cache-dir --only-binary=:all: --require-hashes \
       --index-url https://pypi.org/simple -r /opt/browser-requirements.txt \
    && python3 -m pip --isolated --python /opt/mcp-browser/bin/python check \
    && /opt/mcp-browser/bin/python -I -c 'import playwright.sync_api'
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Build context must be git archive of SOURCE_REVISION, never the working tree.
# No repository test or script is executed during the privileged build.
COPY . /opt/curvature/
LABEL io.local-mcp-gateway.source-revision=${SOURCE_REVISION}
USER 10001:10001
