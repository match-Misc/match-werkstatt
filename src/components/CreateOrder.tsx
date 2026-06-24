import React from 'react';
import OrderForm from './OrderForm';

interface CreateOrderProps {
  onClose?: () => void;
}

export default function CreateOrder({ onClose }: CreateOrderProps) {
  return <OrderForm mode="create" onClose={onClose} />;
}