import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Order } from '../types';

export default function OrderOriginLink({ order }: { order: Order }) {
  const { t } = useTranslation();
  if (!order.duplicatedFrom) return null;
  return (
    <p className="mt-2 text-sm text-gray-600">
      {t('orderDetails.duplicatedFrom', 'Dupliziert von Auftrag')}{' '}
      <Link className="font-medium text-blue-600 hover:underline" to={`/orders/${encodeURIComponent(order.duplicatedFrom.orderNumber || order.duplicatedFrom.id)}`}>
        {order.duplicatedFrom.orderNumber || order.duplicatedFrom.id}
      </Link>
    </p>
  );
}
