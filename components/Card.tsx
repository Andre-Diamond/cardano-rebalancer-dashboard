// ../components/Card.tsx

import React from "react";
import styles from "../styles/Card.module.css";

interface Props {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<Props> = ({ children, className = "" }) => {
  return <div className={`${styles.card} ${className}`}>{children}</div>;
};

export default Card;
