"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ─── Helpers ──────────────────────────────────────────────
/** Pad teams to next power of 2 for single elimination */
function nextPowerOf2(n) {
    let p = 1;
    while (p < n)
        p *= 2;
    return p;
}
/** Generate single-elimination bracket matches for a list of seeded team IDs */
function generateSingleEliminationBracket(teamIds) {
    const size = nextPowerOf2(teamIds.length);
    const matches = [];
    // Pad with nulls (byes)
    const seeded = [];
    for (let i = 0; i < size; i++) {
        seeded.push(i < teamIds.length ? teamIds[i] : null);
    }
    // Standard bracket seeding: 1 vs size, 2 vs size-1, etc.
    const ordered = new Array(size);
    for (let i = 0; i < size / 2; i++) {
        ordered[i * 2] = seeded[i];
        ordered[i * 2 + 1] = seeded[size - 1 - i];
    }
    // Round 1 matches
    for (let i = 0; i < size / 2; i++) {
        const a = ordered[i * 2];
        const b = ordered[i * 2 + 1];
        const isBye = !a || !b;
        matches.push({
            round: 1,
            match_number: i + 1,
            team_a_id: a,
            team_b_id: b,
            status: isBye ? 'bye' : 'pending',
        });
    }
    // Subsequent rounds (empty, filled as winners advance)
    let prevRoundMatches = size / 2;
    let round = 2;
    while (prevRoundMatches > 1) {
        const thisRound = prevRoundMatches / 2;
        for (let i = 0; i < thisRound; i++) {
            matches.push({
                round,
                match_number: i + 1,
                team_a_id: null,
                team_b_id: null,
                status: 'pending',
            });
        }
        prevRoundMatches = thisRound;
        round++;
    }
    return matches;
}
/** Generate round-robin matches */
function generateRoundRobinMatches(teamIds) {
    const matches = [];
    let matchNum = 1;
    // Each pair plays once
    for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
            matches.push({
                round: 1, // round-robin is "all round 1" — sorted by match_number
                match_number: matchNum++,
                team_a_id: teamIds[i],
                team_b_id: teamIds[j],
                status: 'pending',
            });
        }
    }
    return matches;
}
// ─── Public: List tournaments ─────────────────────────────
// GET /api/tournaments — list all published tournaments
router.get('/', async (req, res) => {
    try {
        const { status, sport, unit_id } = req.query;
        const where = {};
        if (status)
            where.status = status;
        if (sport)
            where.sport = sport;
        if (unit_id)
            where.unit_id = unit_id;
        // Hide drafts from public listing
        if (!status)
            where.status = { not: 'draft' };
        const tournaments = await prisma_1.default.tournament.findMany({
            where,
            include: {
                unit: { select: { name: true, short_name: true } },
                registrations: {
                    select: { id: true, status: true },
                },
            },
            orderBy: { start_date: 'asc' },
        });
        const result = tournaments.map(t => ({
            ...t,
            registered_teams: t.registrations.filter(r => r.status !== 'withdrawn').length,
            spots_left: t.max_teams - t.registrations.filter(r => r.status !== 'withdrawn').length,
            registrations: undefined, // don't leak full list
        }));
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/tournaments/:id — tournament detail with bracket + registrations
router.get('/:id', async (req, res) => {
    try {
        const tournament = await prisma_1.default.tournament.findUnique({
            where: { id: req.params.id },
            include: {
                unit: { select: { name: true, short_name: true } },
                registrations: {
                    include: {
                        players: {
                            include: {
                                profile: {
                                    select: { id: true, first_name: true, last_name: true, photo_url: true },
                                },
                            },
                        },
                    },
                    orderBy: { seed: 'asc' },
                },
                matches: {
                    orderBy: [{ round: 'asc' }, { match_number: 'asc' }],
                },
            },
        });
        if (!tournament)
            return res.status(404).json({ error: 'Torneo no encontrado' });
        return res.json(tournament);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ─── Auth required: Registration ──────────────────────────
// POST /api/tournaments/:id/register — register a team
router.post('/:id/register', auth_1.requireAuth, async (req, res) => {
    try {
        const tournament = await prisma_1.default.tournament.findUnique({
            where: { id: req.params.id },
            include: { registrations: { where: { status: { not: 'withdrawn' } } } },
        });
        if (!tournament)
            return res.status(404).json({ error: 'Torneo no encontrado' });
        if (tournament.status !== 'registration_open') {
            return res.status(400).json({ error: 'El registro no está abierto' });
        }
        if (new Date() > tournament.registration_deadline) {
            return res.status(400).json({ error: 'La fecha límite de registro ha pasado' });
        }
        if (tournament.registrations.length >= tournament.max_teams) {
            return res.status(400).json({ error: 'El torneo está lleno' });
        }
        const { team_name, player_ids } = req.body;
        // player_ids: array of profile IDs (including the requester)
        if (!player_ids || !Array.isArray(player_ids) || player_ids.length === 0) {
            return res.status(400).json({ error: 'Debes incluir al menos un jugador' });
        }
        if (player_ids.length !== tournament.team_size) {
            return res.status(400).json({
                error: `Este torneo requiere exactamente ${tournament.team_size} jugador(es) por equipo`,
            });
        }
        // Check that requester is in the team
        const userId = req.user.id;
        if (!player_ids.includes(userId)) {
            return res.status(400).json({ error: 'Debes ser parte del equipo' });
        }
        // Check players aren't already registered in this tournament
        const existing = await prisma_1.default.tournamentPlayer.findMany({
            where: {
                profile_id: { in: player_ids },
                registration: { tournament_id: tournament.id, status: { not: 'withdrawn' } },
            },
        });
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Uno o más jugadores ya están registrados en este torneo' });
        }
        // Validate all player IDs exist and belong to same membership or are valid members
        const profiles = await prisma_1.default.memberProfile.findMany({
            where: { id: { in: player_ids }, is_active: true },
        });
        if (profiles.length !== player_ids.length) {
            return res.status(400).json({ error: 'Uno o más jugadores no fueron encontrados' });
        }
        const registration = await prisma_1.default.tournamentRegistration.create({
            data: {
                tournament_id: tournament.id,
                team_name: team_name || profiles.map(p => p.first_name).join(' & '),
                seed: tournament.registrations.length + 1,
                players: {
                    create: player_ids.map((pid, i) => ({
                        profile_id: pid,
                        is_captain: pid === userId,
                    })),
                },
            },
            include: {
                players: {
                    include: {
                        profile: { select: { first_name: true, last_name: true } },
                    },
                },
            },
        });
        return res.status(201).json(registration);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /api/tournaments/:id/register — withdraw from tournament
router.delete('/:id/register', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const tournamentId = req.params.id;
        const tournament = await prisma_1.default.tournament.findUnique({ where: { id: tournamentId } });
        if (!tournament)
            return res.status(404).json({ error: 'Torneo no encontrado' });
        if (tournament.status === 'in_progress' || tournament.status === 'completed') {
            return res.status(400).json({ error: 'No puedes retirarte de un torneo en curso' });
        }
        // Find user's registration
        const player = await prisma_1.default.tournamentPlayer.findFirst({
            where: {
                profile_id: userId,
                registration: { tournament_id: tournamentId, status: { not: 'withdrawn' } },
            },
            include: { registration: true },
        });
        if (!player)
            return res.status(404).json({ error: 'No estás registrado en este torneo' });
        await prisma_1.default.tournamentRegistration.update({
            where: { id: player.registration_id },
            data: { status: 'withdrawn' },
        });
        return res.json({ message: 'Te has retirado del torneo' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ─── Admin: Tournament management ─────────────────────────
// POST /api/tournaments — create tournament (admin/staff)
router.post('/', auth_1.requireAuth, async (req, res) => {
    try {
        const perms = req.user.parsedPermissions;
        if (req.user.role !== 'titular' && !perms?.admin) {
            return res.status(403).json({ error: 'Solo administradores pueden crear torneos' });
        }
        const { unit_id, name, sport, format, team_size, max_teams, registration_fee, prize_description, rules, start_date, end_date, registration_deadline, image_color, } = req.body;
        if (!unit_id || !name || !sport || !start_date || !registration_deadline || !max_teams) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }
        const tournament = await prisma_1.default.tournament.create({
            data: {
                unit_id,
                name,
                sport,
                format: format || 'single_elimination',
                team_size: team_size || 2,
                max_teams,
                registration_fee: registration_fee || 0,
                prize_description,
                rules,
                start_date: new Date(start_date),
                end_date: end_date ? new Date(end_date) : null,
                registration_deadline: new Date(registration_deadline),
                image_color,
                created_by: req.user.id,
                status: 'draft',
            },
        });
        return res.status(201).json(tournament);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /api/tournaments/:id — update tournament
router.patch('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const perms = req.user.parsedPermissions;
        if (req.user.role !== 'titular' && !perms?.admin) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        const tournament = await prisma_1.default.tournament.update({
            where: { id: req.params.id },
            data: req.body,
        });
        return res.json(tournament);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/tournaments/:id/generate-bracket — generate bracket and start tournament
router.post('/:id/generate-bracket', auth_1.requireAuth, async (req, res) => {
    try {
        const perms = req.user.parsedPermissions;
        if (req.user.role !== 'titular' && !perms?.admin) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        const tournament = await prisma_1.default.tournament.findUnique({
            where: { id: req.params.id },
            include: {
                registrations: {
                    where: { status: { not: 'withdrawn' } },
                    orderBy: { seed: 'asc' },
                },
                matches: true,
            },
        });
        if (!tournament)
            return res.status(404).json({ error: 'Torneo no encontrado' });
        if (tournament.matches.length > 0) {
            return res.status(400).json({ error: 'El bracket ya fue generado' });
        }
        if (tournament.registrations.length < 2) {
            return res.status(400).json({ error: 'Se necesitan al menos 2 equipos' });
        }
        const teamIds = tournament.registrations.map(r => r.id);
        let bracketMatches;
        if (tournament.format === 'round_robin') {
            bracketMatches = generateRoundRobinMatches(teamIds);
        }
        else {
            bracketMatches = generateSingleEliminationBracket(teamIds);
        }
        // Create all matches
        await prisma_1.default.tournamentMatch.createMany({
            data: bracketMatches.map(m => ({
                tournament_id: tournament.id,
                round: m.round,
                match_number: m.match_number,
                team_a_id: m.team_a_id,
                team_b_id: m.team_b_id,
                status: m.status,
            })),
        });
        // Auto-advance byes in round 1
        const byeMatches = bracketMatches.filter(m => m.status === 'bye');
        for (const bye of byeMatches) {
            const winnerId = bye.team_a_id || bye.team_b_id;
            if (winnerId) {
                const match = await prisma_1.default.tournamentMatch.findFirst({
                    where: {
                        tournament_id: tournament.id,
                        round: bye.round,
                        match_number: bye.match_number,
                    },
                });
                if (match) {
                    await prisma_1.default.tournamentMatch.update({
                        where: { id: match.id },
                        data: { winner_id: winnerId, status: 'bye' },
                    });
                    // Advance winner to next round
                    await advanceWinner(tournament.id, bye.round, bye.match_number, winnerId);
                }
            }
        }
        // Update tournament status
        await prisma_1.default.tournament.update({
            where: { id: tournament.id },
            data: { status: 'in_progress', current_round: 1 },
        });
        // Confirm all registered teams
        await prisma_1.default.tournamentRegistration.updateMany({
            where: { tournament_id: tournament.id, status: 'registered' },
            data: { status: 'confirmed' },
        });
        // Return full bracket
        const result = await prisma_1.default.tournament.findUnique({
            where: { id: tournament.id },
            include: {
                matches: { orderBy: [{ round: 'asc' }, { match_number: 'asc' }] },
                registrations: {
                    include: { players: { include: { profile: { select: { first_name: true, last_name: true } } } } },
                },
            },
        });
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
/** Advance winner to the next round match */
async function advanceWinner(tournamentId, round, matchNumber, winnerId) {
    const nextRound = round + 1;
    const nextMatchNumber = Math.ceil(matchNumber / 2);
    const isTeamA = matchNumber % 2 === 1; // odd = team_a, even = team_b
    const nextMatch = await prisma_1.default.tournamentMatch.findFirst({
        where: {
            tournament_id: tournamentId,
            round: nextRound,
            match_number: nextMatchNumber,
        },
    });
    if (nextMatch) {
        await prisma_1.default.tournamentMatch.update({
            where: { id: nextMatch.id },
            data: isTeamA ? { team_a_id: winnerId } : { team_b_id: winnerId },
        });
    }
}
// POST /api/tournaments/:id/matches/:matchId/score — record match result
router.post('/:id/matches/:matchId/score', auth_1.requireAuth, async (req, res) => {
    try {
        const perms = req.user.parsedPermissions;
        if (req.user.role !== 'titular' && !perms?.admin) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        const { score_a, score_b, winner_id } = req.body;
        if (!winner_id)
            return res.status(400).json({ error: 'Debes indicar el ganador' });
        const match = await prisma_1.default.tournamentMatch.findUnique({
            where: { id: req.params.matchId },
        });
        if (!match)
            return res.status(404).json({ error: 'Partido no encontrado' });
        if (match.tournament_id !== req.params.id) {
            return res.status(400).json({ error: 'Partido no pertenece a este torneo' });
        }
        if (match.status === 'completed') {
            return res.status(400).json({ error: 'Este partido ya tiene resultado' });
        }
        // Validate winner is one of the teams
        if (winner_id !== match.team_a_id && winner_id !== match.team_b_id) {
            return res.status(400).json({ error: 'El ganador debe ser uno de los equipos del partido' });
        }
        // Update match
        await prisma_1.default.tournamentMatch.update({
            where: { id: match.id },
            data: {
                score_a,
                score_b,
                winner_id,
                status: 'completed',
                played_at: new Date(),
            },
        });
        // Mark loser as eliminated
        const loserId = winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
        if (loserId) {
            await prisma_1.default.tournamentRegistration.update({
                where: { id: loserId },
                data: { status: 'eliminated' },
            });
        }
        // Get tournament to check format
        const tournament = await prisma_1.default.tournament.findUnique({
            where: { id: req.params.id },
            include: { matches: true },
        });
        if (tournament && tournament.format !== 'round_robin') {
            // Advance winner to next round
            await advanceWinner(tournament.id, match.round, match.match_number, winner_id);
            // Check if tournament is complete (final match scored)
            const totalRounds = Math.ceil(Math.log2(nextPowerOf2(tournament.max_teams)));
            if (match.round === totalRounds) {
                // This was the final — tournament complete
                await prisma_1.default.tournament.update({
                    where: { id: tournament.id },
                    data: { status: 'completed' },
                });
                await prisma_1.default.tournamentRegistration.update({
                    where: { id: winner_id },
                    data: { status: 'winner' },
                });
            }
        }
        else if (tournament && tournament.format === 'round_robin') {
            // Check if all matches are done
            const pending = tournament.matches.filter(m => m.id !== match.id && m.status !== 'completed');
            if (pending.length === 0) {
                await prisma_1.default.tournament.update({
                    where: { id: tournament.id },
                    data: { status: 'completed' },
                });
            }
        }
        // Return updated bracket
        const result = await prisma_1.default.tournament.findUnique({
            where: { id: req.params.id },
            include: {
                matches: { orderBy: [{ round: 'asc' }, { match_number: 'asc' }] },
                registrations: {
                    include: { players: { include: { profile: { select: { first_name: true, last_name: true } } } } },
                },
            },
        });
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/tournaments/:id/standings — round-robin standings
router.get('/:id/standings', async (req, res) => {
    try {
        const tournament = await prisma_1.default.tournament.findUnique({
            where: { id: req.params.id },
            include: {
                registrations: {
                    where: { status: { not: 'withdrawn' } },
                    include: {
                        players: {
                            include: { profile: { select: { first_name: true, last_name: true } } },
                        },
                    },
                },
                matches: { where: { status: 'completed' } },
            },
        });
        if (!tournament)
            return res.status(404).json({ error: 'Torneo no encontrado' });
        const standings = tournament.registrations.map(reg => {
            const wins = tournament.matches.filter(m => m.winner_id === reg.id).length;
            const losses = tournament.matches.filter(m => (m.team_a_id === reg.id || m.team_b_id === reg.id) && m.winner_id && m.winner_id !== reg.id).length;
            const played = wins + losses;
            return {
                registration_id: reg.id,
                team_name: reg.team_name,
                players: reg.players.map(p => ({
                    name: `${p.profile.first_name} ${p.profile.last_name}`,
                })),
                played,
                wins,
                losses,
                points: wins * 3, // 3 points per win
            };
        });
        standings.sort((a, b) => b.points - a.points || b.wins - a.wins);
        return res.json(standings);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
