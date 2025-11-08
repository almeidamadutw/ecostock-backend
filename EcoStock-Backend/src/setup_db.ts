import { Client, ClientConfig } from 'pg';
import 'dotenv/config'; // Garante que o .env seja lido no início

// --- Variáveis de Configuração ---
const DATABASE_URL = process.env.DATABASE_URL;
const TEST_EMAIL = 'teste@ecostock.com';
const TEST_PASSWORD = '123456'; // Esta é a senha que usaremos para o login

/**
 * Parseia a DATABASE_URL para um objeto de configuração.
 * Isso resolve o erro "SASL: client password must be a string"
 * tratando a senha explicitamente como string.
 */
function parseDatabaseUrl(url: string | undefined): ClientConfig {
    if (!url) {
        throw new Error("ERRO: DATABASE_URL não está definida no .env.");
    }
    
    // Regex para capturar: postgresql://[user]:[password]@[host]:[port]/[database]?[params]
    // Esta regex espera que a senha esteja lá.
    const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(\w+)\??(.*)$/);
    
    if (!match) {
        console.error("Formato da DATABASE_URL:", url);
        throw new Error("Formato de DATABASE_URL inválido. Deve ser: postgresql://user:password@host:port/dbname");
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [, user, password, host, port, database, params] = match;

    // Verifica os parâmetros (ex: ?ssl=false)
    const sslQuery = params || '';
    let sslConfig: ClientConfig['ssl'] = false; // Padrão é desativado para localhost

    if (sslQuery.includes('ssl=true')) {
        sslConfig = { rejectUnauthorized: false };
    } else if (sslQuery.includes('ssl=false')) {
        sslConfig = false;
    } else if (!host.includes('localhost')) {
         // Ativa SSL se não for localhost e nada for dito
        sslConfig = { rejectUnauthorized: false };
    }

    return {
        user: user,
        password: String(password), // Garante que a senha (ex: 160106) seja uma string
        host: host,
        port: parseInt(port, 10),
        database: database,
        ssl: sslConfig
    };
}

async function setupDatabase() {
    console.log("[SETUP] Iniciando a configuração do banco de dados...");
    
    let client: Client | undefined;

    try {
        const config = parseDatabaseUrl(DATABASE_URL);
        
        // 1. Conexão
        client = new Client(config); 
        await client.connect();
        console.log("[SETUP] Conexão com o banco de dados bem-sucedida.");

        // 2. Criação da Tabela 'users'
        const createUsersTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(createUsersTableQuery);
        console.log("[SETUP] Tabela 'users' verificada/criada com sucesso.");

        // 3. Inserção do Usuário de Teste
        const userExists = await client.query('SELECT 1 FROM users WHERE email = $1', [TEST_EMAIL]);

        if (userExists.rowCount === 0) {
            // Usando senha em texto puro (123456)
            const passwordToStore = TEST_PASSWORD; 

            const insertUserQuery = `
                INSERT INTO users (email, password_hash, name)
                VALUES ($1, $2, $3)
            `;
            await client.query(insertUserQuery, [TEST_EMAIL, passwordToStore, 'Admin Teste']);
            
            console.log(`[SETUP] Usuário de teste '${TEST_EMAIL}' inserido com sucesso (senha: ${TEST_PASSWORD}).`);
            console.log("AVISO: A senha foi salva em texto puro. O login funcionará APENAS se o servidor for ajustado.");
        } else {
            console.log(`[SETUP] Usuário '${TEST_EMAIL}' já existe. Pulando a inserção.`);
        }

        console.log("[SETUP] Banco de dados inicializado com sucesso.");

    } catch (error) {
        console.error("[SETUP] ERRO DURANTE A INICIALIZAÇÃO DO BANCO:", error);
        process.exit(1); 
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Inicia a execução do setup
setupDatabase();