const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const salas = {};

const NAIPES = ['♣', '♥', '♠', '♦'];
const VALORES = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const criarBaralho = () => {
    let baralho = [];
    let id = 1;
    for (let v of VALORES) {
        for (let n of NAIPES) {
            baralho.push({ id: id++, valor: v, naipe: n });
        }
    }
    return baralho;
};

io.on('connection', (socket) => {
    socket.on('CRIAR_SALA', ({ salaId, jogador, modoJogo }) => {
        socket.join(salaId);
        salas[salaId] = {
            host: socket.id,
            modoJogo: modoJogo || 4,
            jogadores: [{ ...jogador, socketId: socket.id }],
            statusJogo: 'aguardando',
            placar: { eq1: 0, eq2: 0 },
            pontosMao: 1
        };
        socket.emit('ATUALIZAR_SALA', salas[salaId]);
    });

    socket.on('ENTRAR_SALA', ({ salaId, jogador }) => {
        const sala = salas[salaId];
        if (!sala) return socket.emit('ERRO', 'Sala não encontrada!');
        if (sala.jogadores.length >= sala.modoJogo) return socket.emit('ERRO', 'A sala já está cheia!');

        socket.join(salaId);
        sala.jogadores.push({ ...jogador, socketId: socket.id });
        io.to(salaId).emit('ATUALIZAR_SALA', sala);
    });

    socket.on('ADICIONAR_BOTS', ({ salaId }) => {
        const sala = salas[salaId];
        if (!sala || sala.host !== socket.id) return;

        let numEq1 = sala.jogadores.filter(j => j.equipe === 1).length;
        let numEq2 = sala.jogadores.filter(j => j.equipe === 2).length;
        const limite = sala.modoJogo / 2;
        let botCount = 1;

        while (sala.jogadores.length < sala.modoJogo) {
            let eq = (numEq1 < limite) ? 1 : 2;
            if (eq === 1) numEq1++; else numEq2++;

            sala.jogadores.push({
                socketId: 'BOT_' + Math.random().toString(36).substr(2, 5),
                nome: `Robô ${botCount++}`,
                equipe: eq,
                isBot: true
            });
        }
        io.to(salaId).emit('ATUALIZAR_SALA', sala);
    });

    socket.on('INICIAR_PARTIDA', ({ salaId }) => {
        const sala = salas[salaId];
        if (!sala || sala.host !== socket.id) return;

        let baralho = criarBaralho();
        baralho.sort(() => Math.random() - 0.5);

        sala.jogadores.forEach(j => {
            j.cartas = [baralho.pop(), baralho.pop(), baralho.pop()];
        });

        sala.vira = baralho.pop();
        sala.statusJogo = 'jogando';
        sala.vezJogador = 0;
        sala.cartasNaMesa = [];

        io.to(salaId).emit('PARTIDA_INICIADA', sala);
    });

    socket.on('JOGAR_CARTA', ({ salaId, carta, jogadorIdx }) => {
        const sala = salas[salaId];
        if (!sala) return;

        const jogador = sala.jogadores[jogadorIdx];
        if (jogador) {
            jogador.cartas = (jogador.cartas || []).filter(c => c.id !== carta.id);
        }

        const jogada = {
            jogadorIdx,
            nome: jogador ? jogador.nome : 'Jogador',
            equipe: jogador ? jogador.equipe : 1,
            carta
        };

        sala.cartasNaMesa.push(jogada);
        sala.vezJogador = (sala.vezJogador + 1) % sala.jogadores.length;

        io.to(salaId).emit('CARTA_JOGADA', {
            jogada,
            proximoJogador: sala.vezJogador,
            cartasNaMesa: sala.cartasNaMesa
        });
    });

    socket.on('disconnect', () => {
        for (let id in salas) {
            salas[id].jogadores = salas[id].jogadores.filter(j => j.socketId !== socket.id);
            if (salas[id].jogadores.length === 0) {
                delete salas[id];
            } else {
                io.to(id).emit('ATUALIZAR_SALA', salas[id]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor a rodar na porta ${PORT}`));