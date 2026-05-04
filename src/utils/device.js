import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'app_device_id';

let _cachedId = null;
const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const initDeviceId = async () => {
    if (_cachedId) return _cachedId;

    try {
        let id;

        if (isWeb) {
            id = window.localStorage.getItem(DEVICE_ID_KEY);

            if (!id) {
                id = uuidv4();
                window.localStorage.setItem(DEVICE_ID_KEY, id);
            }

        } else {
            id = await AsyncStorage.getItem(DEVICE_ID_KEY);

            if (!id) {
                id = uuidv4();
                await AsyncStorage.setItem(DEVICE_ID_KEY, id);
            }
        }

        _cachedId = id;
        return id;

    } catch (err) {
        console.warn('device.js error → fallback to ephemeral ID:', err);
        _cachedId = uuidv4();
        return _cachedId;
    }
};

export const getDeviceId = () => {
    if (!_cachedId) {
        throw new Error(
            'getDeviceId() called before initDeviceId() resolved. ' +
            'Make sure you await initDeviceId() in root layout.'
        );
    }
    return _cachedId;
};