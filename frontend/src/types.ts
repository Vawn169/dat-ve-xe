// Kiểu dữ liệu khớp với phản hồi của backend (xem http://localhost:3000/api/docs)

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface User {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
}

export interface Stop {
  id: number;
  name: string;
  address: string;
  type: 'PICKUP' | 'DROPOFF' | 'BOTH';
  orderNo: number;
  offsetMinutes: number;
  lat: number | null;
  lng: number | null;
}

export interface RouteInfo {
  id: number;
  originCity: string;
  destinationCity: string;
  durationMinutes: number | null;
  distanceKm: number | null;
  isActive: boolean;
  stops: Stop[];
}

export interface TripSummary {
  id: number;
  departAt: string;
  arriveAt: string;
  basePrice: number;
  busType: string;
  amenities: string[];
  operatorName: string;
  operatorId: number;
  routeId: number;
  operatorLogo: string | null;
  /** Ảnh xe, ảnh đầu là ảnh đại diện */
  photos: string[];
  totalSeats: number;
  pickups: TripStopBrief[];
  dropoffs: TripStopBrief[];
  originCity: string;
  destinationCity: string;
  availableSeats: number;
  rating: number | null;
  ratingCount: number;
}

export interface TripStopBrief {
  id: number;
  name: string;
  offsetMinutes: number;
}

export interface TripDetail {
  id: number;
  routeId: number;
  departAt: string;
  arriveAt: string;
  basePrice: number;
  status: string;
  route: { originCity: string; destinationCity: string; stops: Stop[]; operator: { name: string; hotline: string | null; logoUrl: string | null } };
  bus: { busType: string; plateNumber: string; amenities: string[]; photos: string[] };
}

export interface ReviewList {
  average: number | null;
  count: number;
  reviews: { id: number; rating: number; comment: string | null; createdAt: string; tripDate: string; author: string }[];
}

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'HELD_BY_ME' | 'SOLD' | 'BLOCKED';

export interface Seat {
  seatId: number;
  code: string;
  floor: number;
  rowNo: number;
  colNo: number;
  price: number;
  femaleOnly: boolean;
  status: SeatStatus;
}

export interface SeatMap {
  trip: { id: number; departAt: string; basePrice: number; busType: string; originCity: string; destinationCity: string; status: string };
  layout: { floors: number; rows: number; cols: number };
  holdTtlSeconds: number;
  seats: Seat[];
}

export type BookingStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'PAYMENT_FAILED' | 'NEEDS_REFUND';

export interface Booking {
  code: string;
  status: BookingStatus;
  channel: 'ONLINE' | 'COUNTER';
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  totalAmount: number;
  refundAmount: number | null;
  expiresAt: string;
  createdAt: string;
  changedFromTripId: number | null;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  canChange: boolean;
  canReview: boolean;
  review: { rating: number; comment: string | null } | null;
  trip: {
    id: number;
    routeId: number;
    departAt: string;
    arriveAt: string;
    originCity: string;
    destinationCity: string;
    busType: string;
    plateNumber: string;
    status: string;
  };
  pickupStop: { id: number; name: string; address: string; lat: number | null; lng: number | null };
  dropoffStop: { id: number; name: string; address: string; lat: number | null; lng: number | null };
  seats: { seatId: number; code: string; passengerName: string | null; gender: Gender | null; age: number | null; price: number; checkedIn: boolean }[];
  cancelFee?: number;
  feePercent?: number;
}

export interface SavedPassenger {
  id: number;
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  age: number | null;
}

/** Ghế đã chọn chuyển sang bước tiếp theo */
export interface PickedSeats {
  tripId: number;
  seatIds: number[];
  seatCodes: string[];
  femaleOnly: boolean[];
  prices: number[];
  pickupStopId: number;
  dropoffStopId: number;
  expiresAt: number;
}
export type CheckoutDraft = PickedSeats;
