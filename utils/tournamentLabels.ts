import { Tournament, TournamentType } from '../types.ts';

const compareTournamentDaysChronologically = (a: Tournament, b: Tournament): number => {
    const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (byDate !== 0) return byDate;

    const byName = a.name.localeCompare(b.name, 'it');
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id, 'it');
};

export const getTournamentSeriesKey = (tournament: Tournament): string =>
    tournament.giornataName || tournament.name;

const getNonTeamSeriesTournaments = (tournament: Tournament, tournaments: Tournament[]): Tournament[] =>
    tournaments
        .filter(t =>
            t.type !== TournamentType.TorneoASquadre &&
            getTournamentSeriesKey(t) === getTournamentSeriesKey(tournament)
        )
        .sort(compareTournamentDaysChronologically);

export const getCompletedTournamentDayDisplayName = (
    tournament: Tournament,
    tournaments: Tournament[]
): string => {
    if (tournament.type === TournamentType.TorneoASquadre) {
        return tournament.name;
    }

    // Torneo Libero giornaliero: keep grouping by series key, but always display
    // the user-defined tournament name for that specific day.
    if (tournament.type === TournamentType.TorneoLibero) {
        return tournament.name;
    }

    const seriesDays = getNonTeamSeriesTournaments(tournament, tournaments);
    if (seriesDays.length <= 1) return tournament.name;

    const seriesName = getTournamentSeriesKey(tournament);

    // Se il torneo ha un nome specifico distinto dal nome della serie, usa quello!
    if (tournament.name && tournament.name.trim() !== seriesName.trim()) {
        return tournament.name;
    }

    // Altrimenti mostra il tipo/formato della giornata (es. 'Mexicano', 'Beat the Box')
    return tournament.type;
};

export const getTournamentDisplayName = (
    tournament: Tournament,
    tournaments: Tournament[]
): string => getCompletedTournamentDayDisplayName(tournament, tournaments);
