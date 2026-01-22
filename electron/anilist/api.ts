/**
 * AniList GraphQL API Client
 * Handles manga search, list management, and progress updates
 */

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

export interface AniListMedia {
    id: number;
    title: {
        romaji: string;
        english: string | null;
        native: string | null;
    };
    chapters: number | null;
    volumes: number | null;
    status: string;
    coverImage: {
        medium: string;
        large: string;
    };
    description: string | null;
    averageScore: number | null;
    genres: string[];
}

export interface AniListMediaListEntry {
    id: number;
    mediaId: number;
    progress: number;
    status: string;
    score: number;
    media: AniListMedia;
}

export interface AniListUser {
    id: number;
    name: string;
    avatar: {
        medium: string;
    };
}

// GraphQL Queries
const SEARCH_MANGA_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
        media(search: $search, type: MANGA) {
            id
            title {
                romaji
                english
                native
            }
            chapters
            volumes
            status
            coverImage {
                medium
                large
            }
            description
            averageScore
            genres
        }
    }
}
`;

const GET_MANGA_BY_ID_QUERY = `
query ($id: Int) {
    Media(id: $id, type: MANGA) {
        id
        title {
            romaji
            english
            native
        }
        chapters
        volumes
        status
        coverImage {
            medium
            large
        }
        description
        averageScore
        genres
    }
}
`;

const GET_USER_QUERY = `
query {
    Viewer {
        id
        name
        avatar {
            medium
        }
    }
}
`;

const GET_USER_MANGA_LIST_QUERY = `
query ($userId: Int) {
    MediaListCollection(userId: $userId, type: MANGA) {
        lists {
            name
            entries {
                id
                mediaId
                progress
                status
                score
                media {
                    id
                    title {
                        romaji
                        english
                    }
                    chapters
                    coverImage {
                        medium
                    }
                }
            }
        }
    }
}
`;

const SAVE_MEDIA_LIST_ENTRY_MUTATION = `
mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
        id
        mediaId
        progress
        status
    }
}
`;

class AniListAPI {
    private accessToken: string | null = null;

    setAccessToken(token: string | null): void {
        this.accessToken = token;
    }

    getAccessToken(): string | null {
        return this.accessToken;
    }

    private async request<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const response = await fetch(ANILIST_GRAPHQL_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            throw new Error(`AniList API error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();

        if (json.errors) {
            throw new Error(`AniList GraphQL error: ${json.errors[0]?.message || 'Unknown error'}`);
        }

        return json.data;
    }

    /**
     * Search for manga by title
     */
    async searchManga(search: string, page = 1, perPage = 10): Promise<AniListMedia[]> {
        const data = await this.request<{ Page: { media: AniListMedia[] } }>(
            SEARCH_MANGA_QUERY,
            { search, page, perPage }
        );
        return data.Page.media;
    }

    /**
     * Get manga by AniList ID
     */
    async getMangaById(id: number): Promise<AniListMedia | null> {
        try {
            const data = await this.request<{ Media: AniListMedia }>(
                GET_MANGA_BY_ID_QUERY,
                { id }
            );
            return data.Media;
        } catch {
            return null;
        }
    }

    /**
     * Get the authenticated user's info
     */
    async getViewer(): Promise<AniListUser | null> {
        if (!this.accessToken) return null;

        try {
            const data = await this.request<{ Viewer: AniListUser }>(GET_USER_QUERY);
            return data.Viewer;
        } catch {
            return null;
        }
    }

    /**
     * Get user's manga list
     */
    async getUserMangaList(userId: number): Promise<AniListMediaListEntry[]> {
        const data = await this.request<{
            MediaListCollection: {
                lists: { name: string; entries: AniListMediaListEntry[] }[];
            };
        }>(GET_USER_MANGA_LIST_QUERY, { userId });

        // Flatten all lists into a single array
        return data.MediaListCollection.lists.flatMap(list => list.entries);
    }

    /**
     * Update manga progress on AniList
     */
    async updateProgress(
        mediaId: number,
        progress: number,
        status?: 'CURRENT' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'PLANNING'
    ): Promise<{ id: number; mediaId: number; progress: number; status: string }> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with AniList');
        }

        const variables: Record<string, any> = { mediaId, progress };
        if (status) {
            variables.status = status;
        }

        const data = await this.request<{
            SaveMediaListEntry: { id: number; mediaId: number; progress: number; status: string };
        }>(SAVE_MEDIA_LIST_ENTRY_MUTATION, variables);

        return data.SaveMediaListEntry;
    }
}

// Export singleton instance
export const anilistAPI = new AniListAPI();
