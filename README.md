# Portal de Manutenção v4

Full-stack com concurrently: React (Vite) + Node.js + MySQL

## Inicio rapido

npm install && npm run install:all
cp backend/.env.example backend/.env
# edite backend/.env com DB e JWT_SECRET
npm run db:setup
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001

## Usuarios iniciais
Criados apenas em desenvolvimento (`NODE_ENV=development`) pelo `npm run seed` ou `npm run docker:dev`.

admin / Admin@123
supervisor / Super@123
sindico / Sind@123
morador / Mor@123
campo / Campo@123

Os dados demonstrativos ficam em `database/seeds/*.sql`.
As migrations em `database/migrations/*.sql` devem conter apenas estrutura/evolucao do banco.

## Build para producao
npm run build  # gera backend/public/
npm start      # serve tudo em :3001

Em producao, as migrations sobem somente a estrutura do banco. Seeds ficam desligados por padrao (`RUN_SEEDS=false`).
