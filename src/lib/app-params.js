const isNode = typeof window === 'undefined';

// Safe storage wrapper with error handling
const createSafeStorage = () => {
  if (isNode) {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
  }
  
  try {
    // Test if localStorage is available
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return localStorage;
  } catch (e) {
    console.warn('localStorage not available, using in-memory storage');
    // Fallback to in-memory storage
    const map = new Map();
    return {
      getItem: (key) => map.get(key) || null,
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key)
    };
  }
};

const storage = createSafeStorage();

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: (() => {
			const urlParams = new URLSearchParams(window.location.search);
			const fromUrl = urlParams.get("functions_version");
			if (fromUrl) return fromUrl;
			// Do NOT read from localStorage — prevents sandbox "preview" value leaking into production
			return import.meta.env.VITE_BASE44_FUNCTIONS_VERSION || null;
		})(),
		appBaseUrl: getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL }),
	}
}


export const appParams = {
	...getAppParams()
}