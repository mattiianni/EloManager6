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
import { TorneoPersonaleEngine } from './torneoPersonale/engine';
import { TorneoPersonalePrinter } from './torneoPersonale/printer';
import { MexicanEngine } from './messicano/engine';
import { MexicanPrinter } from './messicano/printer';

class TournamentRegistryImpl {
    private engines = new Map<TournamentType, TournamentEngine>();
    private printers = new Map<TournamentType, TournamentPrinter>();
    private initialized = false;

    private ensureInitialized() {
        if (this.initialized) return;
        this.initialized = true;

        // Round Robin + Finali & TorneOtto
        this.registerEngine(RoundRobinEngine);
        this.registerPrinter(RoundRobinPrinter);
        this.engines.set(TournamentType.TorneOtto, RoundRobinEngine);
        this.printers.set(TournamentType.TorneOtto, RoundRobinPrinter);

        // Beat the Box
        this.registerEngine(BeatTheBoxEngine);
        this.registerPrinter(BeatTheBoxPrinter);

        // Americano
        this.registerEngine(AmericanoEngine);
        this.registerPrinter(AmericanoPrinter);

        // Messicano (JIT)
        this.registerEngine(MexicanEngine);
        this.registerPrinter(MexicanPrinter);

        // Gironi + Fase Finale
        this.registerPrinter(GironiPrinter);

        // Eliminazione Diretta / TPRA
        this.registerPrinter(EliminazioneDirettaPrinter);

        // Torneo Libero
        this.registerPrinter(TorneoLiberoPrinter);

        // Torneo a Squadre
        this.registerPrinter(TeamTournamentPrinter);

        // Torneo Personale (costruttore dinamico a fasi)
        this.registerEngine(TorneoPersonaleEngine);
        this.registerPrinter(TorneoPersonalePrinter);
    }

    public registerEngine(engine: TournamentEngine) {
        this.engines.set(engine.type, engine);
    }

    public registerPrinter(printer: TournamentPrinter) {
        this.printers.set(printer.type, printer);
    }

    public getEngine(type: TournamentType): TournamentEngine {
        this.ensureInitialized();
        const engine = this.engines.get(type);
        if (!engine) {
            const msg = `[TournamentRegistry] Engine non registrato per tipo: ${type}`;
            if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
                console.warn(msg);
            }
            return RoundRobinEngine;
        }
        return engine;
    }

    public getPrinter(type: TournamentType): TournamentPrinter {
        this.ensureInitialized();
        const printer = this.printers.get(type);
        if (!printer) {
            const msg = `[TournamentRegistry] Printer non registrato per tipo: ${type}`;
            if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
                console.warn(msg);
            }
            return RoundRobinPrinter;
        }
        return printer;
    }
}

export const TournamentRegistry = new TournamentRegistryImpl();
