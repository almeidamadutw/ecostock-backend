import express, { Request, Response, Router } from 'express';
import { Pool } from 'pg';

const router = Router();
let pool: Pool;

export const initializeRoutes = (dbPool: Pool) => {
    pool = dbPool;

    console.log('Inicializando rotas...');

    router.get('/', (req: Request, res: Response) => {
        res.send('Backend com Express funcionando!');
    });

    router.get('/db-test', async (req: Request, res: Response) => {
        try {
            const client = await pool.connect();
            const result = await client.query('SELECT NOW()');
            client.release();
            res.json({
                message: 'Conexão com PostgreSQL bem-sucedida!',
                serverTime: result.rows[0],
            });
        } catch (err) {
            console.error('Erro ao conectar ao PostgreSQL:', err);
            res.status(500).json({ error: 'Erro ao conectar ao banco de dados' });
        }
    });

    router.get('/api/categorias', async (req: Request, res: Response) => {
        try {
            const result = await pool.query(`
                SELECT 
                    c.categoria_id, 
                    c.nome, 
                    c.descricao, 
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM empresas e 
                        WHERE e.ramo = c.nome
                    ), 0) as empresas,
                    COALESCE((
                        SELECT SUM(e.produtos) 
                        FROM empresas e 
                        WHERE e.ramo = c.nome
                    ), 0) as produtos
                FROM categorias c
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Erro ao listar categorias:', err);
            res.status(500).json({ error: 'Erro ao listar categorias' });
        }
    });

    router.post('/api/categorias', async (req: Request, res: Response) => {
        const { nome, descricao } = req.body;
        if (!nome) {
            return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
        }
        try {
            const result = await pool.query(
                'INSERT INTO categorias (nome, descricao) VALUES ($1, $2) RETURNING *',
                [nome, descricao || null]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao criar categoria:', err);
            res.status(500).json({ error: 'Erro ao criar categoria' });
        }
    });

    router.put('/api/categorias/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        const { nome, descricao } = req.body;
        if (!nome) {
            return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
        }
        try {
            const currentCategoria = await pool.query(
                'SELECT nome FROM categorias WHERE categoria_id = $1',
                [id]
            );
            if (currentCategoria.rowCount === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada' });
            }
            const oldNome = currentCategoria.rows[0].nome;

            const result = await pool.query(
                'UPDATE categorias SET nome = $1, descricao = $2 WHERE categoria_id = $3 RETURNING *',
                [nome, descricao || null, id]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada' });
            }

            await pool.query(
                'UPDATE empresas SET ramo = $1 WHERE ramo = $2',
                [nome, oldNome]
            );

            res.json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao atualizar categoria:', err);
            res.status(500).json({ error: 'Erro ao atualizar categoria' });
        }
    });

    router.delete('/api/categorias/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        try {
            const result = await pool.query('DELETE FROM categorias WHERE categoria_id = $1', [id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Categoria não encontrada' });
            }
            res.status(204).send();
        } catch (err) {
            console.error('Erro ao deletar categoria:', err);
            res.status(500).json({ error: 'Erro ao deletar categoria' });
        }
    });

    // ROTA DE LOGIN CORRIGIDA: Usa a tabela 'users' e as colunas 'email' e 'password'
    // A comparação de senha é feita em texto puro, conforme a correção do setup_db.ts
    router.post('/api/login', async (req: Request, res: Response) => {
        console.log('Rota /api/login chamada');
        // O cliente envia login (email) e senha
        const { login, senha } = req.body; 

        if (!login || !senha) {
            return res.status(400).json({ error: 'Login (email) e senha são obrigatórios' });
        }
        try {
            // 1. Busca o usuário por email na tabela 'users'
            // NOTA: 'email' no banco deve corresponder a 'login' enviado
            const result = await pool.query(
                'SELECT id, email, password FROM users WHERE email = $1 AND password = $2',
                [login, senha]
            );

            if (result.rowCount === 0) {
                return res.status(401).json({ error: 'Login ou senha inválidos' });
            }
            
            // 2. Login bem-sucedido
            const user = result.rows[0];
            res.json({ message: 'Login bem-sucedido', user: { id: user.id, email: user.email } });
        } catch (err) {
            console.error('Erro ao realizar login:', err);
            res.status(500).json({ error: 'Erro ao realizar login' });
        }
    });

    // Rotas para Empresas
    router.get('/api/empresas', async (req: Request, res: Response) => {
        try {
            const result = await pool.query('SELECT * FROM empresas');
            res.json(result.rows);
        } catch (err) {
            console.error('Erro ao listar empresas:', err);
            res.status(500).json({ error: 'Erro ao listar empresas' });
        }
    });

    router.get('/api/empresas/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        try {
            const result = await pool.query('SELECT * FROM empresas WHERE empresa_id = $1', [id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao buscar empresa:', err);
            res.status(500).json({ error: 'Erro ao buscar empresa' });
        }
    });

    router.post('/api/empresas', async (req: Request, res: Response) => {
        const { nome, cnpj, endereco, telefone, email, responsavel, ramo, produtos } = req.body;
        if (!nome || !cnpj || !telefone) {
            return res.status(400).json({ error: 'Nome, CNPJ e telefone são obrigatórios' });
        }
        try {
            const result = await pool.query(
                'INSERT INTO empresas (nome, cnpj, endereco, telefone, email, responsavel, ramo, produtos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
                [nome, cnpj, endereco || null, telefone, email || null, responsavel || null, ramo || null, produtos || 0]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao criar empresa:', err);
            res.status(500).json({ error: 'Erro ao criar empresa' });
        }
    });

    router.put('/api/empresas/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        const { nome, cnpj, endereco, telefone, email, responsavel, ramo, produtos } = req.body;
        if (!nome || !cnpj || !telefone) {
            return res.status(400).json({ error: 'Nome, CNPJ e telefone são obrigatórios' });
        }
        try {
            const result = await pool.query(
                'UPDATE empresas SET nome = $1, cnpj = $2, endereco = $3, telefone = $4, email = $5, responsavel = $6, ramo = $7, produtos = $8 WHERE empresa_id = $9 RETURNING *',
                [nome, cnpj, endereco || null, telefone, email || null, responsavel || null, ramo || null, produtos || 0, id]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao atualizar empresa:', err);
            res.status(500).json({ error: 'Erro ao atualizar empresa' });
        }
    });

    // Rotas para Trocas
    // Listar todas as trocas
    router.get('/api/trocas', async (req: Request, res: Response) => {
        try {
            const result = await pool.query('SELECT * FROM trocas');
            res.json(result.rows);
        } catch (err) {
            console.error('Erro ao buscar trocas:', err);
            res.status(500).json({ error: 'Erro ao buscar trocas' });
        }
    });

    router.get('/api/trocas/:troca_id', async (req: Request, res: Response) => {
        const { troca_id } = req.params;
        try {
            const result = await pool.query('SELECT * FROM trocas WHERE troca_id = $1', [troca_id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Troca não encontrada' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao buscar troca:', err);
            res.status(500).json({ error: 'Erro ao buscar troca' });
        }
    });

    // Criar uma nova troca
    router.post('/api/trocas', async (req: Request, res: Response) => {
        const { empresa_solicitante, empresa_receptora, data, status, observacoes, categoria_solicitante, categoria_receptora } = req.body;
        if (!empresa_solicitante || !empresa_receptora || !categoria_solicitante || !categoria_receptora) {
            return res.status(400).json({ error: 'Empresa solicitante, receptora e categorias são obrigatórias' });
        }
        if (status && status.length > 50) {
            return res.status(400).json({ error: 'O status não pode ter mais de 50 caracteres' });
        }
        try {
            const result = await pool.query(
                'INSERT INTO trocas (empresa_solicitante, empresa_receptora, data, status, observacoes, categoria_solicitante, categoria_receptora) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                [empresa_solicitante, empresa_receptora, data || new Date(), status || 'pendente', observacoes || null, categoria_solicitante, categoria_receptora]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao criar troca:', err);
            res.status(500).json({ error: 'Erro ao criar troca' });
        }
    });

    // Atualizar uma troca (editar status)
    router.put('/api/trocas/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'Status é obrigatório' });
        }
        try {
            const result = await pool.query(
                'UPDATE trocas SET status = $1 WHERE troca_id = $2 RETURNING *',
                [status, id]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Troca não encontrada' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao atualizar troca:', err);
            res.status(500).json({ error: 'Erro ao atualizar troca' });
        }
    });

    router.delete('/api/trocas/:troca_id', async (req: Request, res: Response) => {
        const { troca_id } = req.params;
        try {
            const result = await pool.query('DELETE FROM trocas WHERE troca_id = $1 RETURNING *', [troca_id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Troca não encontrada' });
            }
            res.status(200).json({ message: 'Troca excluída com sucesso' });
        } catch (err) {
            console.error('Erro ao deletar troca:', err);
            res.status(500).json({ error: 'Erro ao deletar troca' });
        }
    });

    // Listar todas as comunicações
    router.get('/api/comunicacoes', async (req: Request, res: Response) => {
        try {
            const result = await pool.query(`
                SELECT 
                    c.contato_id, 
                    c.troca_id, 
                    c.assunto, 
                    c.data_contato, 
                    c.duracao, 
                    e1.nome AS empresa_origem, 
                    e2.nome AS empresa_destino 
                FROM contatos c
                JOIN empresas e1 ON c.empresa_origem_id = e1.empresa_id
                JOIN empresas e2 ON c.empresa_destino_id = e2.empresa_id
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Erro ao buscar comunicações:', err);
            res.status(500).json({ error: 'Erro ao buscar comunicações' });
        }
    });

    // Obter detalhes de uma comunicação específica
    router.get('/api/comunicacoes/:contato_id', async (req: Request, res: Response) => {
        const { contato_id } = req.params;
        try {
            const result = await pool.query(`
                SELECT 
                    c.contato_id, 
                    c.troca_id, 
                    c.assunto, 
                    c.data_contato, 
                    c.duracao, 
                    e1.nome AS empresa_origem, 
                    e2.nome AS empresa_destino 
                FROM contatos c
                JOIN empresas e1 ON c.empresa_origem_id = e1.empresa_id
                JOIN empresas e2 ON c.empresa_destino_id = e2.empresa_id
                WHERE c.contato_id = $1
            `, [contato_id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Comunicação não encontrada' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao buscar comunicação:', err);
            res.status(500).json({ error: 'Erro ao buscar comunicação' });
        }
    });

    // Criar uma nova comunicação
    router.post('/api/comunicacoes', async (req: Request, res: Response) => {
        const { troca_id, empresa_origem_id, empresa_destino_id, assunto, data_contato, duracao } = req.body;
        if (!empresa_origem_id || !empresa_destino_id || !assunto) {
            return res.status(400).json({ error: 'Empresa origem, empresa destino e assunto são obrigatórios' });
        }
        try {
            const result = await pool.query(
                `INSERT INTO contatos (troca_id, empresa_origem_id, empresa_destino_id, assunto, data_contato, duracao) 
                VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [troca_id || null, empresa_origem_id, empresa_destino_id, assunto, data_contato || new Date(), duracao || null]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Erro ao criar comunicação:', err);
            res.status(500).json({ error: 'Erro ao criar comunicação' });
        }
    });

    return router;
};