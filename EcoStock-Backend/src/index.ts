import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import 'dotenv/config';
import cors from 'cors';
import { initializeRoutes } from './routes';

const app = express();
const port = process.env.PORT || 3001;

// Define se estamos em modo de desenvolvimento (local) ou produção (deploy)
const isDevelopment = process.env.NODE_ENV !== 'production';

// Configuração do CORS
const allowedOrigins = [
  'http://localhost:3000', // Desenvolvimento local
  'https://ecostockfinal.vercel.app', // Frontend no Vercel
  process.env.FRONTEND_URL, // Variável de ambiente
].filter(Boolean); // Remove valores undefined ou vazios

app.use(cors({
  origin: (origin, callback) => {
    console.log('Origem recebida:', origin); // Log para depuração
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('Origem não permitida:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Suporte a credenciais, se necessário
}));

// Lidar com requisições OPTIONS (preflight)
app.options('*', cors());

// Middleware para log de requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.get('Origin')}`);
  next();
});

app.use(express.json());

// Log de variáveis de ambiente
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('Allowed Origins:', allowedOrigins);

// Configuração do banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // CORREÇÃO ESSENCIAL:
  // Se for desenvolvimento (isDevelopment é true), ssl é 'false'.
  // Se for produção, ele usa a configuração de certificado.
  ssl: isDevelopment ? false : { rejectUnauthorized: false } 
});

// Testar conexão com o banco de dados
(async () => {
  try {
    const client = await pool.connect();
    console.log('Conexão com o banco de dados bem-sucedida');
    client.release();
  } catch (err: any) {
    console.error('Erro ao conectar ao banco de dados:', err.stack);
  }
})();

// Inicializar rotas
app.use('/', initializeRoutes(pool));

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});