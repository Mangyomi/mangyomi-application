import DiscordRPC from 'discord-rpc';

const clientId = '1456059378221449357'; // Mangyomi App ID (Placeholder/Registered)

let rpc: DiscordRPC.Client | null = null;
let isReady = false;

export const connect = async () => {
    if (rpc) return;

    rpc = new DiscordRPC.Client({ transport: 'ipc' });

    rpc.on('ready', () => {
        isReady = true;
        console.log('Discord RPC connected');
    });

    try {
        await rpc.login({ clientId });
    } catch (error) {
        console.error('Failed to connect to Discord RPC:', error);
        rpc = null;
    }
};

interface DiscordButton {
    label: string;
    url: string;
}

export const updateActivity = async (
    details: string,
    state: string,
    largeImageKey: string = 'icon',
    largeImageText: string = 'Mangyomi',
    smallImageKey?: string,
    smallImageText?: string,
    buttons?: DiscordButton[]
) => {
    if (!rpc || !isReady) {
        // Try reconnecting if not connected
        await connect();
    }

    if (!rpc || !isReady) return;

    try {
        await rpc.setActivity({
            details,
            state,
            largeImageKey,
            largeImageText,
            smallImageKey,
            smallImageText,
            buttons,
            instance: false,
            startTimestamp: Date.now(),
        });
    } catch (error) {
        console.error('Failed to set Discord activity:', error);
    }
};

export const clearActivity = async () => {
    if (!rpc || !isReady) return;
    try {
        await rpc.clearActivity();
    } catch (error) {
        console.error('Failed to clear Discord activity:', error);
    }
};

export const disconnect = async () => {
    if (!rpc) return;
    try {
        await rpc.destroy();
        rpc = null;
        isReady = false;
        console.log('Discord RPC disconnected');
    } catch (error) {
        console.error('Failed to disconnect Discord RPC:', error);
    }
};
