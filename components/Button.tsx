// ../components/Button.tsx

import React from "react";
import styles from "../styles/Button.module.css";

interface Props {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<Props> = ({ onClick, disabled, children }) => {
  return (
    <button onClick={onClick} disabled={disabled} className={styles.button}>
      {children}
    </button>
  );
};

export default Button;
