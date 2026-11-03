# Os testes rodam na montagem: se algum falhar, a montagem para e o painel continua na versão anterior
FROM node:24-alpine AS testes
WORKDIR /app
COPY . .
RUN npm test

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# o package.json vem da etapa de testes para a montagem esperar os testes passarem
COPY --from=testes --chown=node:node /app/package.json ./
COPY --chown=node:node server.mjs account-api.mjs billing.mjs ./
COPY --chown=node:node integrations ./integrations
COPY --chown=node:node public ./public
# só a validação da assinatura (a função "cobranca" do Supabase usa o mesmo arquivo)
COPY --chown=node:node supabase/functions/cobranca/cobranca.mjs ./supabase/functions/cobranca/cobranca.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
