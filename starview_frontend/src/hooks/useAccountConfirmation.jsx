import { useEffect, useRef, useState } from 'react';
import authApi from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import ConfirmationDialog from '../components/profile/AccountConfirmation';

export default function useAccountConfirmation() {
  const { user } = useAuth();
  const owner = user?.id;
  const [prompt, setPrompt] = useState(null);
  const pending = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, [owner]);

  const complete = (accepted, attempt) => {
    if (attempt !== generation.current || !mounted.current) return;
    pending.current?.resolve(accepted);
    pending.current = null;
    setPrompt(null);
  };

  const confirm = async ({ password, force = false } = {}) => {
    if (!owner || !mounted.current) return false;
    const attempt = ++generation.current;
    pending.current?.resolve(false);
    pending.current = null;
    setPrompt(null);
    const isCurrent = () => mounted.current && attempt === generation.current;
    const { data } = await authApi.getSecurityStatus();
    if (!isCurrent()) return false;
    if (data.recent && !force) return true;
    // Reuse proof already entered in the password-change form.
    if (data.method === 'password' && password) {
      await authApi.confirmIdentity({ password });
      return isCurrent();
    }
    return new Promise((resolve) => {
      pending.current = { resolve, attempt };
      setPrompt({ method: data.method, methods: data.methods, preferredMethod: data.preferred_method, attempt, owner });
    });
  };

  return { confirm, dialog: prompt && prompt.owner === owner
    ? <ConfirmationDialog key={prompt.attempt} method={prompt.method} methods={prompt.methods} preferredMethod={prompt.preferredMethod}
        onComplete={accepted => complete(accepted, prompt.attempt)} /> : null };
}
