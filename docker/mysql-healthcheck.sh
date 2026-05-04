#!/bin/sh
# Healthcheck robusto para MySQL — verifica conexão e banco específico
mysqladmin ping -h localhost \
  -u "${MYSQL_USER}" \
  -p"${MYSQL_PASSWORD}" \
  --silent 2>/dev/null && \
mysql -h localhost \
  -u "${MYSQL_USER}" \
  -p"${MYSQL_PASSWORD}" \
  -e "USE ${MYSQL_DATABASE}; SELECT 1;" \
  "${MYSQL_DATABASE}" 2>/dev/null
