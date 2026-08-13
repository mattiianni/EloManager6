import { TournamentType } from '../types';
import { TournamentEngine, TournamentPrinter } from './types';
import { RoundRobinEngine } from './roundRobinFinali/engine';
import { RoundRobinPrinter } from './roundRobinFinali/printer';
import { BeatTheBoxEngine } from './beatTheBox/engine';
import { BeatTheBoxPrinter } from './beatTheBox/printer';
import { AmericanoEngine } from './americano/engine';
import { AmericanoPrinter } from './americano/printer';
import { GironiPrinter } from './gironiFaseFinale/printer';
import { EliminazioneDirettaPrinter } from './eliminazioneDiretta/printer';
import { TorneoLiberoPrinter } from './torneoLibero/printer';
import { TeamTournamentPrinter } from './torneoASquadre/printer';

class TournamentRegistryImpl {
    private engines = new Map<TournamentType, TournamentEngine>();
    private printers = new Map<TournamentType, TournamentPrinter>();

    constructor() {
        // Round Robin + Finali & TorneOtto
        this.registerEngine(RoundRobinEngine);
        this.registerPrinter(RoundRobinPrinter);
        this.engines.set(TournamentType.TorneOtto, RoundRobinEngine);
        this.printers.set(TournamentType.TorneOtto, RoundRobinPrinter);

        // Beat the Box
        this.registerEngine(BeatTheBoxEngine);
        this.registerPrinter(BeatTheBoxPrinter);

        // Americano & Serie
        this.registerEngine(AmericanoEngine);
        this.registerPrinter(AmericanoPrinter);
        this.engines.set(TournamentType.Serie, AmericanoEngine);
        this.printers.set(TournamentType.Serie, AmericanoPrinter);

        // Gironi + Fase Finale
        this.registerPrinter(GironiPrinter);

        // Eliminazione Diretta / TPRA
        this.registerPrinter(EliminazioneDirettaPrinter);

        // Torneo Libero
        this.registerPrinter(TorneoLiberoPrinter);

        // Torneo a Squadre
        this.registerPrinter(TeamTournamentPrinter);
    }

    public registerEngine(engine: TournamentEngine) {
        this.engines.set(engine.type, engine);
    }

    public registerPrinter(printer: TournamentPrinter) {
        this.printers.set(printer.type, printer);
    }

    public getEngine(type: TournamentType): TournamentEngine {
        const engine = this.engines.get(type);
        if (!engine) {
            return RoundRobinEngine;
        }
        return engine;
    }

    public getPrinter(type: TournamentType): TournamentPrinter {
        const printer = this.printers.get(type);
        if (!printer) {
            return RoundRobinPrinter;
        }
        return printer;
    }
}

export const TournamentRegistry = new TournamentRegistryImpl();
