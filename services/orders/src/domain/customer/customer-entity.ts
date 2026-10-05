type CustomerProps = {
  id: string;
  name: string;
  email: string;
  address: string;
  state: string;
  zipCode: string;
  country: string;
  dateOfBirth: Date | null;
};

export class CustomerEntity {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly address: string;
  readonly state: string;
  readonly zipCode: string;
  readonly country: string;
  readonly dateOfBirth: Date | null;

  private constructor(props: CustomerProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.address = props.address;
    this.state = props.state;
    this.zipCode = props.zipCode;
    this.country = props.country;
    this.dateOfBirth = props.dateOfBirth;
  }

  static restore(props: CustomerProps): CustomerEntity {
    return new CustomerEntity(props);
  }
}
