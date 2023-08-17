import { minimatch } from 'minimatch';

export class MatchUtil {
    public match(patterns: string[] = [], value = '') {
        for (const pattern of patterns) {
            if (minimatch(value, pattern)) {
                return true;
            }
        }
        return false;
    }
}
