// ../components/Skeleton.tsx

import React from "react";
import styles from "../styles/Skeleton.module.css";

interface Props {
  className?: string;
}

const Skeleton: React.FC<Props> = ({ className = "" }) => {
  return <div className={`${styles.skeleton} ${className}`} />;
};

export default Skeleton;
