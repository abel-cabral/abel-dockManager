import * as fs from 'fs';
import * as path from 'path';

const configPath = 'nginx/nginx.conf';

export class NginxClass {
    ip = process.env.IPADDRESS
    nomeServico: string | undefined;
    porta: string | undefined;
    dominio: string | undefined;

    constructor(
        nomeServico?: string,
        dominio?: string,
        porta?: string
    ) {
        this.nomeServico = nomeServico;
        this.porta = porta;
        this.dominio = dominio;
    }

    async addServico() {
        const filePath: string = path.resolve(process.cwd(), configPath);
    
        try {
            let data = await fs.promises.readFile(filePath, 'utf8');
    
            // Verifica e adiciona a seção 'events' se não existir
            if (!data.includes('events {')) {
                data = `events {\n    worker_connections 1024;  # Número máximo de conexões por worker\n}\n\n` + data;
            }
    
            // Verifica e adiciona a seção 'http' se não existir
            if (!data.includes('http {')) {
                const httpSection = `
    http {
        # MARCA DE INSERCAO AUTOMATICA 01
        # MARCA DE INSERCAO AUTOMATICA 02
    }
    `;
                data += httpSection;
            }
    
            // Verifica se o nome do serviço já existe
            const serviceExists = new RegExp(`\\s*upstream\\s+${this.nomeServico}\\s*\\{`).test(data);
            if (serviceExists) {
                throw new Error(`O nome de serviço "${this.nomeServico}" já existe no arquivo.`);
            }
    
            // Verifica se a porta já está em uso por outro serviço
            const portRegex = new RegExp(`server\\s+[^:]+:${this.porta}\\s*;`);
            if (portRegex.test(data)) {
                throw new Error(`A porta ${this.porta} já está em uso por outro serviço.`);
            }
    
            // Verifica se o domínio já está em uso
            const domainRegex = new RegExp(`\\b${this.dominio}\\b\\s+\\S+;`);
            if (domainRegex.test(data)) {
                throw new Error(`O domínio "${this.dominio}" já está associado a outro serviço.`);
            }
    
            // Cria o novo bloco de upstream
            const upstreamToAdd = `    upstream ${this.nomeServico} { server 172.17.0.1:${this.porta}; }`;
            
            // Insere o novo upstream na seção correta
            data = data.replace(
                /(# MARCA DE INSERCAO AUTOMATICA 01)/,
                `$1\n${upstreamToAdd}`
            );
    
            // Cria o novo bloco de server
            const serverBlockToAdd = `
        # INIT ${this.nomeServico}
        server {
            listen 80;
            server_name ${this.dominio};
            location / {
                proxy_pass http://${this.nomeServico};
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;  # Use o esquema da requisição original (http ou https)
            }
        }
        # END ${this.nomeServico}`;
    
            // Insere o novo bloco de server na seção correta
            data = data.replace(
                /(# MARCA DE INSERCAO AUTOMATICA 02)/,
                `$1\n${serverBlockToAdd}`
            );
    
            // Escreve de volta no arquivo
            await fs.promises.writeFile(filePath, data, 'utf8');
            return `Upstream ${this.nomeServico} e servidor ${this.dominio} adicionados com sucesso.`;
        } catch (err: any) {
            throw new Error(`Erro ao processar o arquivo: ${err.message}`);
        }
    }

    static removerServico(nomeServico: string) {
        const filePath: string = path.resolve(process.cwd(), configPath);
    
        return new Promise((resolve, reject) => {
            // Lê o arquivo de configuração
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    reject(new Error(`Erro ao ler o arquivo: ${err.message}`));
                    return;
                }
    
                // Regex para encontrar o bloco de upstream do serviço
                const upstreamRegex = new RegExp(
                    `\\s*upstream\\s+${nomeServico}\\s*\\{[^\\}]*\\}`,
                    'g'
                );
    
                // Regex para encontrar o bloco de configuração do servidor
                const serviceBlockRegex = new RegExp(
                    `# INIT\\s+${nomeServico}\\s+([\\s\\S]*?)# END\\s+${nomeServico}`,
                    'g'
                );
    
                // Verifica se o bloco do serviço existe
                if (!serviceBlockRegex.test(data) && !upstreamRegex.test(data)) {
                    resolve(`O serviço "${nomeServico}" não foi encontrado no arquivo.`);
                    return;
                }
    
                // Remove o bloco do serviço e o upstream
                let updatedConfig = data.replace(upstreamRegex, ''); // Remove o upstream
                updatedConfig = updatedConfig.replace(serviceBlockRegex, ''); // Remove o bloco do servidor
    
                // Remove linhas em branco extras
                updatedConfig = updatedConfig.replace(/\n\s*\n/g, '\n'); // Remove linhas em branco
                updatedConfig = updatedConfig.trim(); // Remove espaços em branco no início e no final do arquivo
    
                // Escreve de volta no arquivo
                fs.writeFile(filePath, updatedConfig, 'utf8', (err) => {
                    if (err) {
                        reject(new Error(`Erro ao escrever no arquivo: ${err.message}`));
                        return;
                    }
                    resolve(`Serviço "${nomeServico}" removido com sucesso.`);
                });
            });
        });
    }
}
